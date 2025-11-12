import React, { useEffect, useRef } from "react";
import { DicomProcessor } from "../utils/dicomParser";
import vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import vtkDataArray from "@kitware/vtk.js/Common/Core/DataArray";
import vtkImageMapper from "@kitware/vtk.js/Rendering/Core/ImageMapper";
import vtkImageSlice from "@kitware/vtk.js/Rendering/Core/ImageSlice";
import vtkImageProperty from "@kitware/vtk.js/Rendering/Core/ImageProperty";

export default function FolderLoader({ rendererRef, renderWindowRef, setLoadedFileName, setWarning,setImageData, clearSignal }) {
  const folderInputRef = useRef(null);
  
  useEffect(() => {
    // Cleanup wheel listener if component unmounts
    return () => {
      const renderer = rendererRef?.current;
      const rw = renderWindowRef?.current;
      if (!renderer || !rw) return;

      const views = rw.getViews();
      if (views && views[0]?.getContainer) {
        const container = views[0].getContainer();
        if (container && container._folderWheelListener) {
          container.removeEventListener("wheel", container._folderWheelListener);
          container._folderWheelListener = null;
        }
      }
    };
  }, [rendererRef, renderWindowRef]);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }
  }, [clearSignal]);

  const handleFolder = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      setWarning?.("No DICOM files found");
      return;
    }

    if (!rendererRef?.current || !renderWindowRef?.current) {
      setWarning?.("Renderer not initialized yet");
      return;
    }

    const dicomProcessor = new DicomProcessor();
    try {
      const result = await dicomProcessor.parseFileList(files);
      const { slices, metadata } = result;

      if (!slices.length) {
        setWarning?.("No valid DICOM slices found");
        return;
      }

      const { width, height } = slices[0];
      const imageData = vtkImageData.newInstance();
      imageData.setDimensions([width, height, slices.length]);
      // Preserve voxel spacing for accurate 3D geometry (Surface/Volume)
      const pixelSpacing = Array.isArray(metadata?.pixelSpacing) ? metadata.pixelSpacing : [1, 1];
      const sliceThickness = typeof metadata?.sliceThickness === 'number' ? metadata.sliceThickness : 1;
      // DICOM PixelSpacing = [row, col] => VTK spacing [x=col, y=row, z=slice]
      const spacingX = pixelSpacing[1] || 1;
      const spacingY = pixelSpacing[0] || 1;
      const spacingZ = sliceThickness || 1;
      imageData.setSpacing([spacingX, spacingY, spacingZ]);

      const combined = new Uint16Array(width * height * slices.length);
      for (let i = 0; i < slices.length; i++) {
        combined.set(slices[i].pixelData, i * width * height);
      }

      const dataArray = vtkDataArray.newInstance({
        numberOfComponents: 1,
        values: combined,
        dataType: "Uint16",
        name: "Scalars",
      });
      imageData.getPointData().setScalars(dataArray);

      const mapper = vtkImageMapper.newInstance();
      mapper.setInputData(imageData);
      mapper.setSlicingMode(2); // Z slicing
      mapper.setZSlice(0);

      const imageSlice = vtkImageSlice.newInstance();
      const property = vtkImageProperty.newInstance();
      property.setColorWindow(2000);
      property.setColorLevel(1000);
      imageSlice.setProperty(property);
      imageSlice.setMapper(mapper);

      const renderer = rendererRef.current;
      const rw = renderWindowRef.current;

      renderer.removeAllViewProps();
      renderer.addViewProp(imageSlice);
      renderer.resetCamera();
      rw.render();
      setImageData?.(imageData);

      setLoadedFileName?.(`${files.length} DICOM files loaded`);
      setWarning?.(null);

      let currentSlice = 0;
      const maxSlice = slices.length - 1;
      const updateSlice = (index) => {
        const newSlice = Math.min(Math.max(index, 0), maxSlice);
        if (newSlice !== currentSlice) {
          currentSlice = newSlice;
          mapper.setZSlice(currentSlice);
          rw.render();
        }
      };

      // Safe container access
      const views = rw.getViews();
      if (!views || !views[0]?.getContainer) return;
      const container = views[0].getContainer();

      const onWheel = (event) => {
        event.preventDefault();
        updateSlice(currentSlice + Math.sign(event.deltaY));
      };

      container.addEventListener("wheel", onWheel);
      container._folderWheelListener = onWheel;

    } catch (err) {
      console.error(err);
      setWarning?.(err.message);
    }
  };

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
        Choose Folder
        <input
          ref={folderInputRef}
          type="file"
          webkitdirectory="true"
          directory="true"
          multiple
          onChange={handleFolder}
          style={{ display: "none" }}
        />
      </label>
    </div>
  );
}
