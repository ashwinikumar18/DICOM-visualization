import React, { useEffect, useRef } from "react";
import vtkRenderWindow from "@kitware/vtk.js/Rendering/Core/RenderWindow";
import vtkRenderer from "@kitware/vtk.js/Rendering/Core/Renderer";
import vtkOpenGLRenderWindow from "@kitware/vtk.js/Rendering/OpenGL/RenderWindow";
import vtkRenderWindowInteractor from "@kitware/vtk.js/Rendering/Core/RenderWindowInteractor";
import vtkInteractorStyleTrackballCamera from "@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera";
import vtkVolume from "@kitware/vtk.js/Rendering/Core/Volume";
import vtkVolumeMapper from "@kitware/vtk.js/Rendering/Core/VolumeMapper";
import vtkColorTransferFunction from "@kitware/vtk.js/Rendering/Core/ColorTransferFunction";
import vtkPiecewiseFunction from "@kitware/vtk.js/Common/DataModel/PiecewiseFunction";

const Volume3DViewer = ({ imageData }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!imageData || !containerRef.current) return;

    // --- Renderer setup ---
    const renderWindow = vtkRenderWindow.newInstance();
    const renderer = vtkRenderer.newInstance({ background: [0, 0, 0] });
    const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
    renderWindow.addRenderer(renderer);
    renderWindow.addView(openGLRenderWindow);

    openGLRenderWindow.setContainer(containerRef.current);
    const { clientWidth, clientHeight } = containerRef.current;
    openGLRenderWindow.setSize(clientWidth, clientHeight);

    const interactor = vtkRenderWindowInteractor.newInstance();
    interactor.setView(openGLRenderWindow);
    interactor.initialize();
    interactor.bindEvents(containerRef.current);
    interactor.setInteractorStyle(vtkInteractorStyleTrackballCamera.newInstance());

    // --- Volume setup ---
    const mapper = vtkVolumeMapper.newInstance();
    mapper.setInputData(imageData);
    // to avoid flickering added this line
    mapper.setAutoAdjustSampleDistances(false);
    mapper.setSampleDistance(0.9);
    mapper.setBlendModeToComposite();

    const ctfun = vtkColorTransferFunction.newInstance();
    const ofun = vtkPiecewiseFunction.newInstance();

    const [min, max] = imageData.getPointData().getScalars().getRange();

    // --- Skin-tone color transfer function ---
    // Adjust these stops based on dataset type (CT/MRI)
    ctfun.addRGBPoint(min, 0.0, 0.0, 0.0);          // background (black)
    ctfun.addRGBPoint(min + (max - min) * 0.1, 0.7, 0.5, 0.4);  // dark tissue
    ctfun.addRGBPoint(min + (max - min) * 0.4, 0.9, 0.7, 0.6);  // skin tone
    ctfun.addRGBPoint(max, 1.0, 0.9, 0.8);          // brighter skin

    // --- Opacity (transparency) ---
    ofun.addPoint(min, 0.0);
    ofun.addPoint(min + (max - min) * 0.1, 0.05);
    ofun.addPoint(min + (max - min) * 0.3, 0.15);
    ofun.addPoint(min + (max - min) * 0.6, 0.6);
    ofun.addPoint(max, 0.9);

    const volume = vtkVolume.newInstance();
    volume.setMapper(mapper);
    volume.getProperty().setRGBTransferFunction(0, ctfun);
    volume.getProperty().setScalarOpacity(0, ofun);
    volume.getProperty().setInterpolationTypeToLinear();

    // Lighting tweaks for a better soft appearance
    const volProp = volume.getProperty();
    volProp.setShade(true);
    volProp.setAmbient(0.3);
    volProp.setDiffuse(0.6);
    volProp.setSpecular(0.3);
    volProp.setSpecularPower(10);

    renderer.addVolume(volume);
    renderer.resetCamera();
    renderWindow.render();

    // --- Resize handling ---
    const resizeObserver = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = containerRef.current;
      openGLRenderWindow.setSize(clientWidth, clientHeight);
      renderWindow.render();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      interactor.unbindEvents();
      renderWindow.delete();
      renderer.delete();
      openGLRenderWindow.delete();
    };
  }, [imageData]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "black",
      }}
    />
  );
};

export default Volume3DViewer;
