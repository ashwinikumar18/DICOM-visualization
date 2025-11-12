// dicom-vtk-viewer/App.js
import "./App.css";
import React, { useState, useEffect, useRef } from "react";
import MPRViewer from "./components/MPRViewer"; 
import "@kitware/vtk.js/Rendering/Profiles/Geometry";
import "@kitware/vtk.js/Rendering/Profiles/Volume";
import FileLoader from "./components/FileLoader";
import FolderLoader from "./components/FolderLoader";
import vtkRenderWindow from "@kitware/vtk.js/Rendering/Core/RenderWindow";
import vtkRenderer from "@kitware/vtk.js/Rendering/Core/Renderer";
import vtkOpenGLRenderWindow from "@kitware/vtk.js/Rendering/OpenGL/RenderWindow";
import vtkRenderWindowInteractor from "@kitware/vtk.js/Rendering/Core/RenderWindowInteractor";
import vtkInteractorStyleImage from "@kitware/vtk.js/Interaction/Style/InteractorStyleImage";
import { Cuboid, Columns3 } from "lucide-react";
import Volume3DViewer from "./components/Volume3DViewer";
import Surface3DViewer from "./components/Surface3DViewer";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("Error caught by ErrorBoundary:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, textAlign: "center" }}>
          <h2>Something went wrong with the DICOM viewer.</h2>
          <p>{this.state.error?.message || "Unknown error"}</p>
          <button onClick={() => window.location.reload()}>Reload Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const containerRef = useRef(null);
  const renderWindowRef = useRef(null);
  const rendererRef = useRef(null);
  const openglRef = useRef(null);
  const interactorRef = useRef(null);
  const initializedRef = useRef(false);
  const panCleanupRef = useRef(null);

  const [loadedFileName, setLoadedFileName] = useState(null);
  const [warning, setWarning] = useState(null);
  const [activeTool, setActiveTool] = useState(null);
  
  // ✅ New: View mode state
  const [imageData, setImageData] = useState(null);
  const [viewMode, setViewMode] = useState(""); // "2D" | "MPR" | "3D"
  // Signal to clear upload inputs
  const [clearSignal, setClearSignal] = useState(0);
  const isBaseCanvasActive = !imageData || viewMode === "" || viewMode === "Default";
  

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    let resizeObserver = null;

    const initVTK = () => {
      try {
        const renderWindow = vtkRenderWindow.newInstance();
        const renderer = vtkRenderer.newInstance({ background: [0, 0, 0] });
        const openglRenderWindow = vtkOpenGLRenderWindow.newInstance();

        renderWindow.addView(openglRenderWindow);
        renderWindow.addRenderer(renderer);
        openglRenderWindow.setContainer(containerRef.current);

        const { clientWidth, clientHeight } = containerRef.current;
        openglRenderWindow.setSize(clientWidth || 400, clientHeight || 300);

        const interactor = vtkRenderWindowInteractor.newInstance();
        interactor.setView(openglRenderWindow);
        interactor.setInteractorStyle(vtkInteractorStyleImage.newInstance());
        interactor.initialize();
        interactor.bindEvents(containerRef.current);

        renderWindowRef.current = renderWindow;
        rendererRef.current = renderer;
        openglRef.current = openglRenderWindow;
        interactorRef.current = interactor;

        resizeObserver = new ResizeObserver(() => {
          if (!containerRef.current || !openglRef.current) return;
          const { clientWidth: w, clientHeight: h } = containerRef.current;
          openglRef.current.setSize(w || 400, h || 300);
          renderWindow.render();
        });
        resizeObserver.observe(containerRef.current);
      } catch (err) {
        console.error("VTK init error:", err);
        setWarning("VTK failed: " + err.message);
        initializedRef.current = false;
      }
    };

    initVTK();

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      if (panCleanupRef.current) {
        panCleanupRef.current();
        panCleanupRef.current = null;
      }
      interactorRef.current?.unbindEvents();
      interactorRef.current?.delete();
      openglRef.current?.setContainer(null);
      renderWindowRef.current?.delete();

      initializedRef.current = false;
      renderWindowRef.current = null;
      rendererRef.current = null;
      openglRef.current = null;
      interactorRef.current = null;
    };
  }, []);

  const toggleTool = (tool) => {
    // Only allow tools on the base 2D canvas (not MPR/3D components)
    if (!isBaseCanvasActive) {
      setWarning("Pan/Zoom tools are available only in Default 2D view");
      return;
    }

    const interactor = interactorRef.current;
    const renderer = rendererRef.current;
    const rw = renderWindowRef.current;
    const container = containerRef.current;
    if (!interactor || !renderer || !rw || !container) return;

    if (panCleanupRef.current) {
      panCleanupRef.current();
      panCleanupRef.current = null;
    }

    if (activeTool === tool) {
      interactor.setInteractorStyle(vtkInteractorStyleImage.newInstance());
      setActiveTool(null);
      return;
    }

    if (tool === "pan") {
      let lastX = 0;
      let lastY = 0;
      let isPanning = false;

      const handleMouseDown = (e) => {
        isPanning = true;
        lastX = e.clientX;
        lastY = e.clientY;
      };
      const handleMouseMove = (e) => {
        if (!isPanning) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;

        const camera = renderer.getActiveCamera();
        const scale = 1 / camera.getParallelScale();
        camera.setPosition(
          camera.getPosition()[0] - dx * scale,
          camera.getPosition()[1] + dy * scale,
          camera.getPosition()[2]
        );
        camera.setFocalPoint(
          camera.getFocalPoint()[0] - dx * scale,
          camera.getFocalPoint()[1] + dy * scale,
          camera.getFocalPoint()[2]
        );
        rw.render();
      };
      const handleMouseUp = () => (isPanning = false);

      container.addEventListener("mousedown", handleMouseDown);
      container.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      panCleanupRef.current = () => {
        container.removeEventListener("mousedown", handleMouseDown);
        container.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      setActiveTool("pan");
    } else if (tool === "zoom") {
      interactor.setInteractorStyle(vtkInteractorStyleImage.newInstance());
      setActiveTool("zoom");
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    const renderer = rendererRef.current;
    const rw = renderWindowRef.current;
    if (!container || !renderer || !rw) return;

    const handleWheel = (e) => {
      if (activeTool !== "zoom" || !e.shiftKey) return;
      e.preventDefault();
      const camera = renderer.getActiveCamera();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      camera.zoom(factor);
      rw.render();
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [activeTool]);

  function clearScene() {
    setWarning(null);
    setLoadedFileName(null);

    const renderer = rendererRef.current;
    const rw = renderWindowRef.current;
    if (renderer) {
      const viewProps = renderer.getViewProps();
      viewProps.forEach((prop) => {
        if (prop.getMapper?.()) prop.getMapper().delete();
        if (prop.getProperty?.()) prop.getProperty().delete();
        prop.delete?.();
      });
      renderer.removeAllViewProps();
      rw && rw.render();
    }

    // Reset application state and inputs
    setImageData(null);
    setViewMode("Default");
    setActiveTool(null);
    setClearSignal((v) => v + 1);
  }

  //  New: Handle view mode selection (placeholder)
  const handleViewModeChange = (event) => {
    const mode = event.target.value;
    setViewMode(mode);
    console.log("Switched view mode to:", mode);
    // TODO: Add logic for switching between MPR and 3D views
  };

  return (
    <ErrorBoundary>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        {/* Navbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#222",
            color: "white",
            padding: "10px 20px",
          }}
        >
          <h3 style={{ margin: 0 }}>DICOM Viewer</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <FileLoader
              rendererRef={rendererRef}
              renderWindowRef={renderWindowRef}
              interactorRef={interactorRef}
              setLoadedFileName={setLoadedFileName}
              setWarning={setWarning}
              clearSignal={clearSignal}
            />

            <FolderLoader
                rendererRef={rendererRef}
                renderWindowRef={renderWindowRef}
                setLoadedFileName={setLoadedFileName}
                setWarning={setWarning}
                setImageData={setImageData} // pass setter
                clearSignal={clearSignal}
            />
            <button onClick={clearScene}>Clear</button>
          </div>
        </div>

        {/* Toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            backgroundColor: "#f0f0f0",
            padding: "8px 12px",
            borderBottom: "1px solid #ccc",
          }}
        >
          <button
            onClick={() => toggleTool("pan")}
            disabled={!isBaseCanvasActive}
            style={{
              backgroundColor: !isBaseCanvasActive ? "#eee" : activeTool === "pan" ? "#007bff" : "#ddd",
              color: !isBaseCanvasActive ? "#999" : activeTool === "pan" ? "white" : "black",
              border: "none",
              borderRadius: 4,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            Pan
          </button>
          <button
            onClick={() => toggleTool("zoom")}
            disabled={!isBaseCanvasActive}
            style={{
              backgroundColor: !isBaseCanvasActive ? "#eee" : activeTool === "zoom" ? "#007bff" : "#ddd",
              color: !isBaseCanvasActive ? "#999" : activeTool === "zoom" ? "white" : "black",
              border: "none",
              borderRadius: 4,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            Zoom (Shift + Scroll)
          </button>

          {/* ✅ New Dropdown for View Modes */}
          <div style={{ position: "relative", display: "inline-block", marginLeft: 10 }}>
            <select
              value={viewMode}
              onChange={handleViewModeChange}
              style={{
                padding: "6px 25px",
                paddingRight: "30px",
                borderRadius: 4,
                border: "1px solid #060606ff",
                backgroundColor: "#fff",
                cursor: "pointer",
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: "right 8px center",
                backgroundRepeat: "no-repeat",
                backgroundSize: "16px",
              }}
            >
            <option value="Default">Select Default</option>
            <option value="MPR"> MPR View</option>
            <option value="3D"> 3D View</option>
            <option value="Surface"> Surface View</option>
            </select>
            {/* Icon overlay for selected option */}
            {viewMode === "MPR" && (
              <div style={{
                position: "absolute",
                left: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                color: "#666"
              }}>
                <Columns3 size={16} />
              </div>
            )}
            {viewMode === "3D" && (
              <div style={{
                position: "absolute",
                left: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                color: "#666"
              }}>
                <Cuboid size={16} />
              </div>
            )}
          </div>

          {loadedFileName && (
            <span style={{ marginLeft: "auto" }}>
              Loaded: <strong>{loadedFileName}</strong>
            </span>
          )}
          {warning && (
            <span style={{ color: "crimson", marginLeft: 20 }}>{warning}</span>
          )}
        </div>

        <div style={{ flex: 1, position: "relative", overflow: "hidden", backgroundColor: "black" }}>
  {viewMode === "MPR" && imageData ? (
    <MPRViewer imageData={imageData} />
  ) : viewMode === "3D" && imageData ? (
    <Volume3DViewer imageData={imageData} />
  ) : viewMode === "Surface" && imageData ? (
    <Surface3DViewer imageData={imageData} />
  ) : (
    <div ref={containerRef} style={{ width: "100%", height: "100%", backgroundColor: "black" }} />
  )}
</div>

      </div>
    </ErrorBoundary>
  );
}

export default App;