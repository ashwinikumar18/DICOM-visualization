import React, { useEffect, useRef, useState } from "react";
import vtkRenderWindow from "@kitware/vtk.js/Rendering/Core/RenderWindow";
import vtkRenderer from "@kitware/vtk.js/Rendering/Core/Renderer";
import vtkOpenGLRenderWindow from "@kitware/vtk.js/Rendering/OpenGL/RenderWindow";
import vtkRenderWindowInteractor from "@kitware/vtk.js/Rendering/Core/RenderWindowInteractor";
import vtkInteractorStyleTrackballCamera from "@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkImageMarchingCubes from "@kitware/vtk.js/Filters/General/ImageMarchingCubes";
import vtkPolyDataNormals from "@kitware/vtk.js/Filters/Core/PolyDataNormals";

// Simple surface rendering using iso-surface extraction (marching cubes)
export default function Surface3DViewer({ imageData, initialIsoValue }) {
  const containerRef = useRef(null);
  const mcRef = useRef(null);
  const rwRef = useRef(null);
  const [iso, setIso] = useState(typeof initialIsoValue === "number" ? initialIsoValue : 500);

  useEffect(() => {
    if (!imageData || !containerRef.current) return;

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

    // Marching cubes
    const mc = vtkImageMarchingCubes.newInstance({ computeNormals: false });
    mc.setInputData(imageData);
    // Choose a safe initial iso within the scalar range
    let startIso = iso;
    try {
      const range = imageData?.getPointData()?.getScalars()?.getRange();
      if (range) {
        const r0 = Math.floor(range[0]);
        const r1 = Math.ceil(range[1]);
        // pick mid as default if current iso is out-of-range
        const mid = Math.floor(r0 + (r1 - r0) * 0.5);
        if (!(startIso >= r0 && startIso <= r1)) startIso = mid;
        // also sync UI state to this start value
        setIso(startIso);
      }
    } catch (_) {}
    mc.setContourValue(0, startIso);
    mcRef.current = mc;

    // Compute normals for shading
    const normals = vtkPolyDataNormals.newInstance({ featureAngle: 60.0 });
    normals.setInputConnection(mc.getOutputPort());

    const mapper = vtkMapper.newInstance();
    mapper.setInputConnection(normals.getOutputPort());
    mapper.setScalarVisibility(false);

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setColor(0.85, 0.85, 0.95);
    actor.getProperty().setOpacity(1.0);
    actor.getProperty().setAmbient(0.2);
    actor.getProperty().setDiffuse(0.7);
    actor.getProperty().setSpecular(0.3);
    actor.getProperty().setSpecularPower(20.0);

    renderer.addActor(actor);
    renderer.resetCamera();
    renderWindow.render();
    rwRef.current = renderWindow;

    // Initialize iso once
    mc.setContourValue(0, iso);
    renderWindow.render();

    // Resize handling
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
      mcRef.current = null;
      rwRef.current = null;
      // Filters/actors are GC'd with pipeline delete
    };
  }, [imageData]);

  // Update iso value live without rebuilding pipeline
  useEffect(() => {
    if (mcRef.current && rwRef.current) {
      mcRef.current.setContourValue(0, iso);
      rwRef.current.render();
    }
  }, [iso]);

  // Range estimation from scalar range
  let min = 0;
  let max = 2000;
  try {
    const range = imageData?.getPointData()?.getScalars()?.getRange();
    if (range) {
      min = Math.floor(range[0]);
      max = Math.ceil(range[1]);
    }
  } catch (_) {}

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "black" }}>
      <div style={{ padding: "6px 10px", background: "#111", color: "#ddd", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12 }}>Iso value</span>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={iso}
          onChange={(e) => setIso(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ width: 60, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{iso}</span>
      </div>
      <div ref={containerRef} style={{ flex: 1, background: "black" }} />
    </div>
  );
}


