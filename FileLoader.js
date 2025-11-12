import React, { useRef } from "react";
import vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import vtkDataArray from "@kitware/vtk.js/Common/Core/DataArray";
import vtkImageMapper from "@kitware/vtk.js/Rendering/Core/ImageMapper";
import vtkImageSlice from "@kitware/vtk.js/Rendering/Core/ImageSlice";
import vtkImageProperty from "@kitware/vtk.js/Rendering/Core/ImageProperty";
import dicomParser from "dicom-parser";

export default function FileLoader({ rendererRef, renderWindowRef, setLoadedFileName, setWarning, clearSignal }) {
  const fileInputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoadedFileName(file.name);
    setWarning(null);

    let arrayBuffer;
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch (err) {
      setWarning("Failed to read file");
      return;
    }

    let dataSet;
    try {
      const uint8Array = new Uint8Array(arrayBuffer);
      dataSet = dicomParser.parseDicom(uint8Array);
    } catch (err) {
      setWarning("Failed to parse DICOM: " + err.message);
      return;
    }

    const rows = dataSet.uint16("x00280010");
    const cols = dataSet.uint16("x00280011");
    const bitsAllocated = dataSet.uint16("x00280100");
    const samplesPerPixel = dataSet.uint16("x00280002") || 1;
    const pixelRepresentation = dataSet.uint16("x00280103") || 0;

    if (!rows || !cols) {
      setWarning("DICOM missing Rows/Columns");
      return;
    }

    const pixelDataElement = dataSet.elements.x7fe00010;
    if (!pixelDataElement) {
      setWarning("No PixelData element found");
      return;
    }

    const byteOffset = pixelDataElement.dataOffset;
    const byteLength = pixelDataElement.length;
    const bytes = new Uint8Array(arrayBuffer, byteOffset, byteLength);

    let scalarsArray;
    if (bitsAllocated === 8) {
      scalarsArray = Uint8Array.from(bytes);
    } else if (bitsAllocated === 16) {
      if (bytes.byteLength % 2 !== 0) {
        setWarning("Unexpected 16-bit PixelData length");
        return;
      }
      scalarsArray =
        pixelRepresentation === 1
          ? Int16Array.from(new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2))
          : Uint16Array.from(new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2));
    } else {
      setWarning("Unsupported BitsAllocated: " + bitsAllocated);
      return;
    }

    const renderer = rendererRef?.current;
    const rw = renderWindowRef?.current;
    if (!renderer || !rw) {
      setWarning("VTK not initialized yet");
      return;
    }

    const imageData = vtkImageData.newInstance();
    imageData.setDimensions([cols, rows, 1]);
    imageData.setSpacing([1, 1, 1]);

    const dataArray = vtkDataArray.newInstance({
      numberOfComponents: samplesPerPixel,
      values: scalarsArray,
      dataType:
        scalarsArray.BYTES_PER_ELEMENT === 2
          ? pixelRepresentation === 1
            ? "Int16"
            : "Uint16"
          : "Uint8",
      name: "Scalars",
    });
    imageData.getPointData().setScalars(dataArray);

    const mapper = vtkImageMapper.newInstance();
    mapper.setInputData(imageData);
    mapper.setSlicingMode(0); // XY plane
    mapper.setZSlice(0);

    const imageSlice = vtkImageSlice.newInstance();
    const property = vtkImageProperty.newInstance();
    property.setInterpolationTypeToLinear();

    // ✅ Set consistent window/level for single file
    property.setColorWindow(2000);
    property.setColorLevel(1000);

    imageSlice.setProperty(property);
    imageSlice.setMapper(mapper);

    renderer.removeAllViewProps();
    renderer.addViewProp(imageSlice);
    renderer.resetCamera();
    rw.render();
  };

  React.useEffect(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [clearSignal]);

  return (
    <div>
      <label
        style={{
          display: "inline-block",
          padding: "8px 12px",
          background: "#007bff",
          color: "#fff",
          borderRadius: "6px",
          cursor: "pointer",
          marginBottom: 12,
        }}
      >
        Choose File
        <input
          ref={fileInputRef}
          type="file"
          accept=".dcm"
          onChange={handleFile}
          style={{ display: "none" }}
        />
      </label>
    </div>
  );
}
