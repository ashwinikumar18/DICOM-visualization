import React, { useEffect, useRef } from "react";
import "@kitware/vtk.js/Rendering/Profiles/All";
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import vtkImageSlice from "@kitware/vtk.js/Rendering/Core/ImageSlice";
import vtkImageMapper from "@kitware/vtk.js/Rendering/Core/ImageMapper";
import vtkImageReslice from "@kitware/vtk.js/Imaging/Core/ImageReslice";
import vtkMatrixBuilder from "@kitware/vtk.js/Common/Core/MatrixBuilder";
import vtkInteractorStyleImage from "@kitware/vtk.js/Interaction/Style/InteractorStyleImage";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import vtkPoints from "@kitware/vtk.js/Common/Core/Points";
import vtkCellArray from "@kitware/vtk.js/Common/Core/CellArray";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkPolyDataMapper from "@kitware/vtk.js/Rendering/Core/Mapper";

export default function MPRViewer({ imageData }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!imageData || !containerRef.current) return;

    const parent = containerRef.current;
    parent.innerHTML = "";
    parent.style.display = "flex";
    parent.style.flexDirection = "row";
    parent.style.width = "100%";
    parent.style.height = "100vh";
    parent.style.background = "#000";

    // Helper to create view containers with reset buttons
    const makeViewDiv = (title) => {
      const div = document.createElement("div");
      div.style.flex = "1";
      div.style.border = "1px solid #333";
      div.style.position = "relative";
      div.style.overflow = "hidden";
      div.style.display = "flex";
      div.style.flexDirection = "column";

      const nav = document.createElement("div");
      nav.style.display = "flex";
      nav.style.justifyContent = "space-between";
      nav.style.alignItems = "center";
      nav.style.padding = "6px 10px";
      nav.style.background = "#111";
      nav.style.color = "#0f0";
      nav.style.fontSize = "14px";
      nav.style.zIndex = "3";

      const label = document.createElement("span");
      label.textContent = title;

      const btn = document.createElement("button");
      btn.textContent = "Reset";
      btn.style.background = "#0f0";
      btn.style.color = "#000";
      btn.style.border = "none";
      btn.style.borderRadius = "4px";
      btn.style.cursor = "pointer";
      btn.style.padding = "3px 8px";
      btn.style.fontWeight = "bold";
      btn.onmouseenter = () => (btn.style.background = "#6f6");
      btn.onmouseleave = () => (btn.style.background = "#0f0");

      nav.appendChild(label);
      nav.appendChild(btn);
      div.appendChild(nav);

      const renderDiv = document.createElement("div");
      renderDiv.style.flex = "1";
      renderDiv.style.position = "relative";
      renderDiv.style.overflow = "hidden";
      div.appendChild(renderDiv);

      parent.appendChild(div);
      return { container: div, renderDiv, resetButton: btn };
    };

    const axial = makeViewDiv("Axial");
    const sagittal = makeViewDiv("Sagittal");
    const coronal = makeViewDiv("Coronal");

    const viewDefs = [
      { id: "axial", div: axial.renderDiv, normal: [0, 0, 1], button: axial.resetButton },
      { id: "sagittal", div: sagittal.renderDiv, normal: [1, 0, 0], button: sagittal.resetButton },
      { id: "coronal", div: coronal.renderDiv, normal: [0, 1, 0], button: coronal.resetButton },
    ];

    const spacing = imageData.getSpacing();
    const extent = imageData.getExtent();
    let crossCenter = [
      (extent[0] + extent[1]) * 0.5 * spacing[0],
      (extent[2] + extent[3]) * 0.5 * spacing[1],
      (extent[4] + extent[5]) * 0.5 * spacing[2],
    ];

    const views = [];

    // --- CREATE EACH VIEW ---
    viewDefs.forEach((view) => {
      const grw = vtkGenericRenderWindow.newInstance({ background: [0, 0, 0] });
      grw.setContainer(view.div);
      grw.resize();

      const renderer = grw.getRenderer();
      const renderWindow = grw.getRenderWindow();
      const interactor = grw.getInteractor();
      interactor.setInteractorStyle(vtkInteractorStyleImage.newInstance());

      const reslice = vtkImageReslice.newInstance();
      reslice.setInputData(imageData);
      reslice.setOutputDimensionality(2);

      const updateReslice = () => {
        const axes = vtkMatrixBuilder.buildFromDegree()
          .identity()
          .rotateFromDirections([0, 0, 1], view.normal)
          .getMatrix();
        const mat = new Float32Array(16);
        for (let i = 0; i < 16; i++) mat[i] = axes[i];
        mat[12] = crossCenter[0];
        mat[13] = crossCenter[1];
        mat[14] = crossCenter[2];
        reslice.setResliceAxes(mat);
      };

      updateReslice();

      const mapper = vtkImageMapper.newInstance();
      mapper.setInputConnection(reslice.getOutputPort());
      mapper.setSliceAtFocalPoint(true);
      mapper.setSlicingMode(2);

      const actor = vtkImageSlice.newInstance();
      actor.setMapper(mapper);
      actor.getProperty().setColorWindow(1500);
      actor.getProperty().setColorLevel(750);
      renderer.addActor(actor);

      // --- Crosshair Setup ---
      const crosshair = vtkPolyData.newInstance();
      const crossMapper = vtkPolyDataMapper.newInstance();
      crossMapper.setInputData(crosshair);
      const crossActor = vtkActor.newInstance();
      crossActor.setMapper(crossMapper);
      crossActor.getProperty().setColor(0, 1, 0);
      crossActor.getProperty().setLineWidth(1.5);
      renderer.addActor(crossActor);

      const updateCrosshair = () => {
        const points = vtkPoints.newInstance();
        const lines = vtkCellArray.newInstance();
        const size = 1000;
        points.setData(
          Float32Array.from([
            crossCenter[0] - size, crossCenter[1], crossCenter[2],
            crossCenter[0] + size, crossCenter[1], crossCenter[2],
            crossCenter[0], crossCenter[1] - size, crossCenter[2],
            crossCenter[0], crossCenter[1] + size, crossCenter[2],
          ])
        );
        lines.insertNextCell([0, 1]);
        lines.insertNextCell([2, 3]);
        crosshair.setPoints(points);
        crosshair.setLines(lines);
      };

      updateCrosshair();
      renderer.resetCamera();
      renderer.resetCameraClippingRange();
      renderWindow.render();

      // Store default camera parameters for reset
      const cam = renderer.getActiveCamera();
      const defaultCam = {
        position: [...cam.getPosition()],
        focalPoint: [...cam.getFocalPoint()],
        viewUp: [...cam.getViewUp()],
        parallelScale: cam.getParallelScale(),
      };

      // Reset button handler
      view.button.onclick = () => {
        cam.setPosition(...defaultCam.position);
        cam.setFocalPoint(...defaultCam.focalPoint);
        cam.setViewUp(...defaultCam.viewUp);
        cam.setParallelScale(defaultCam.parallelScale);
        renderer.resetCameraClippingRange();
        renderWindow.render();
      };

      views.push({
        reslice,
        renderer,
        renderWindow,
        normal: view.normal,
        updateReslice,
        updateCrosshair,
      });
    });

    // --- Camera Synchronization ---
    const syncRotation = (sourceRenderer) => {
      const sourceCam = sourceRenderer.getActiveCamera();
      const pos = sourceCam.getPosition();
      const fp = sourceCam.getFocalPoint();
      const viewUp = sourceCam.getViewUp();
      views.forEach(({ renderer, renderWindow }) => {
        if (renderer !== sourceRenderer) {
          const cam = renderer.getActiveCamera();
          cam.setPosition(...pos);
          cam.setFocalPoint(...fp);
          cam.setViewUp(...viewUp);
          renderWindow.render();
        }
      });
    };

    views.forEach(({ renderer, renderWindow }) => {
      const interactor = renderWindow.getInteractor();
      interactor.onAnimation(() => syncRotation(renderer));
    });

    // --- Scroll Slice ---
    views.forEach((v) => {
      const interactor = v.renderWindow.getInteractor();
      interactor.onMouseWheel((event) => {
        if (event.ctrlKey) return; // ctrl reserved for zoom
        const delta = event.spinY > 0 ? 1 : -1;
        crossCenter = [
          crossCenter[0] + v.normal[0] * spacing[0] * delta,
          crossCenter[1] + v.normal[1] * spacing[1] * delta,
          crossCenter[2] + v.normal[2] * spacing[2] * delta,
        ];
        views.forEach((view) => {
          view.updateReslice();
          view.updateCrosshair();
          view.renderWindow.render();
        });
      });
    });

    // --- Zoom (CTRL + Scroll) ---
    views.forEach((v) => {
      const interactor = v.renderWindow.getInteractor();
      interactor.onMouseWheel((event) => {
        if (!event.ctrlKey) return;
        const zoomFactor = event.spinY > 0 ? 1.1 : 0.9;
        views.forEach(({ renderer, renderWindow }) => {
          const cam = renderer.getActiveCamera();
          cam.setParallelScale(cam.getParallelScale() / zoomFactor);
          renderWindow.render();
        });
      });
    });

    return () => {
      parent.innerHTML = "";
    };
  }, [imageData]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#000",
      }}
    />
  );
}
