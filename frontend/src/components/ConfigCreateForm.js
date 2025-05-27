import { useEffect, useRef, useState } from "react";
import ComponentFileSelector from "./ComponentFileSelector"; // Import the file selector popup
import ItemSelector from "./ItemSelector"; // Import the generic selector
import MonacoCodeEditorPopup from "./MonacoCodeEditorPopup";
import SettingsField from "./SettingsField";

const COMPONENTS = ["indexer", "retriever", "augmenter", "generator"];

const parseContent = (content) => {
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
};

/**
 * Build config JSON from form state.
 * - In "create" mode: settings are taken from form state if present, otherwise from registry.
 * - In "edit" mode: settings are always taken from form state (which is initialized from config content).
 */
const buildContent = (form, registry, mode) => {
  const configJson = {};
  COMPONENTS.forEach((c) => {
    const path = form[c]?.path || "";
    let settings;
    if (mode === "edit") {
      // Always use settings from form state in edit mode
      settings = form[c]?.settings || {};
    } else {
      // In create mode, use form state if present, otherwise registry
      settings = form[c]?.settings;
      if (settings === undefined) {
        if (
          registry &&
          registry[c] &&
          registry[c][path] &&
          Array.isArray(registry[c][path]) &&
          registry[c][path].length > 2
        ) {
          settings = registry[c][path][2] || {};
        } else {
          settings = {};
        }
      }
    }
    configJson[c] = {
      path,
      settings,
    };
  });
  return JSON.stringify(configJson, null, 2);
};

// Helper to strip all leading "^." from a path string
function stripCaretDotPrefixes(path) {
  if (typeof path !== "string") return path;
  // Remove all leading "^." (one or more)
  return path.replace(/^(?:\^\.)+/, "");
}


const ConfigCreateForm = ({
  ws,
  onClose,
  onCreated,
  mode = "create", // "create" or "edit"
  config,          // for edit: { id, name, content }
  onUpdated,       // for edit: callback after update
  autoSave = false,
  onAutoSave,
  onConfigsChanged
}) => {
  const [loading, setLoading] = useState(true);
  const [registry, setRegistry] = useState({});
  const [defaults, setDefaults] = useState({});
  const [form, setForm] = useState({
    name: "",
    indexer: { path: "" },
    retriever: { path: "" },
    augmenter: { path: "" },
    generator: { path: "" },
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [componentContent, setComponentContent] = useState(null);
  
  // State for file selector popup
  const [fileSelector, setFileSelector] = useState({
    open: false,
    compName: "",
    error: null,
    creating: false,
  });
  
  // State for visible/hidden files for file selector
  const [visibleFiles, setVisibleFiles] = useState([]);
  const [hiddenFiles, setHiddenFiles] = useState([]);

  // Update the state to include error messages for script and editor popups
  const [scriptEditorError, setScriptEditorError] = useState(null);
  const [editorError, setEditorError] = useState(null);

  // Helper to refresh registry/defaults from backend
  const refreshRegistry = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ command: "config_creation_info", args: [] }));
    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "ok" && data.registry && data.default_config) {
          setRegistry(data.registry);
          setDefaults(data.default_config);
        }
      } catch (e) {}
      ws.removeEventListener("message", handleMessage);
    };
    ws.addEventListener("message", handleMessage);
  };

  // Handler for ItemSelector new component create option
  const handleComponentCreate = (compName) => {
    // Request file list from backend
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ command: "list_scripts", args: [] }));
      // Listen for the response
      const handleListScripts = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.status === "ok" && Array.isArray(data.visible)) {
            setVisibleFiles(data.visible);
            setHiddenFiles(Array.isArray(data.hidden) ? data.hidden : []);
            // DEV: add hidden to visible for development
            setVisibleFiles((prev) => [...prev, ...(Array.isArray(data.hidden) ? data.hidden : [])]);
            setFileSelector({ open: true, compName, error: null, creating: false });
          }
        } catch (e) {}
        // Remove listener after handling
        ws.removeEventListener("message", handleListScripts);
      };
      ws.addEventListener("message", handleListScripts);
    }
  };
  
  // State for script editor popup opened from openScriptEditorPopup
  const [scriptEditorPopup, setScriptEditorPopup] = useState({
    open: false,
    code: "",
    path: "",
  });

  /**
   * Fetches script code from backend and opens the appropriate Monaco editor popup.
   * @param {string} filePath - The script file path.
   * @param {object} [editorOptions] - Optional: { compName, compPath } for component editing.
   */
  const openScriptEditorPopup = (filePath, editorOptions = null) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ command: "get_script", args: [filePath] }));
    const handleGetScript = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "ok") {
          if (editorOptions && editorOptions.compName && editorOptions.compPath) {
            // Open component editor popup
            setEditorPopup({
              open: true,
              lines: data.content,
              compName: editorOptions.compName,
              compPath: editorOptions.compPath,
            });
          } else {
            // Open regular script editor popup
            setScriptEditorPopup({
              open: true,
              code: data.content,
              path: data.path || filePath,
            });
          }
        } else if (data.status === "error") {
          console.log("[ERROR] get_script response:", data);
        }
      } catch (e) {}
      ws.removeEventListener("message", handleGetScript);
    };
    ws.addEventListener("message", handleGetScript);
  };

  // Handlers for script editor popup
  const handleScriptEditorSave = (newCode) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ command: "update_script", args: [scriptEditorPopup.path, newCode] }));
    const handleResponse = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "ok") {
          // console.log(`[DEBUG] Script updated successfully: ${data.message}`);
          // if (typeof onAutoSave === "function") {
          //   onAutoSave(form);
          // }
          setScriptEditorPopup({ open: false, code: "", path: "" });
          setScriptEditorError(null); // Clear error on success
          refreshRegistry(); // Refresh registry after saving
        } else if (data.status === "error") {
          console.error(`[ERROR] Failed to update script: ${data.message}`);
          setScriptEditorError(data.message || "Error updating script");
        }
      } catch (e) {}
      ws.removeEventListener("message", handleResponse);
    };
    ws.addEventListener("message", handleResponse);
  };

  const handleScriptEditorClose = () => {
    // console.log(`[DEBUG] Editor closed without saving. Script: ${scriptEditorPopup.path}`);
    setScriptEditorPopup({ open: false, code: "", path: "" });
  };

  // Handler for file selection in popup
  const handleFileSelected = (filePath) => {
    // Do NOT update form component choice
    setFileSelector({ open: false, compName: "", error: null, creating: false });
    openScriptEditorPopup(filePath);
  };

  const handleFileCreated = (newFilePath) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    const compName = fileSelector.compName;
    // Find the default path for this component type
    const defaultPath = defaults[compName]?.path;
    const startWith = 
      registry[compName] && 
      defaultPath && 
      registry[compName][defaultPath] && 
      registry[compName][defaultPath][0] 
        ? registry[compName][defaultPath][0] 
        : "";
    
    // Set creating state to show loading indicator
    setFileSelector((prev) => ({ ...prev, creating: true, error: null }));

    // Send create_script command to backend
    ws.send(
      JSON.stringify({
        command: "create_script",
        args: [newFilePath, startWith.join ? startWith.join("") : startWith],
      })
    );

    // Handle the response
    const handleCreateScript = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "ok") {
          // Success: close popup, do NOT set form value
          setFileSelector({ open: false, compName: "", error: null, creating: false });
          // Now open script editor for the new file
          openScriptEditorPopup(newFilePath);
        } else if (data.status === "error") {
          // Show error, keep popup open for retry
          setFileSelector((prev) => ({
            ...prev,
            error: data.message || "Error creating file",
            creating: false,
          }));
        }
      } catch (e) {}
      ws.removeEventListener("message", handleCreateScript);
    };
    ws.addEventListener("message", handleCreateScript);
  };

  const handleFileSelectorClose = () => {
    setFileSelector({ open: false, compName: "", error: null, creating: false });
  };
  
  // Handler for ItemSelector link click
  const handleSelectorLinkClick = (name, value) => {
    setComponentContent([name, value]);
  };
  const [editorPopup, setEditorPopup] = useState({ open: false, code: "", compName: "", compPath: "" });
  
  // Track if we should skip the next auto-save (on initial config load in edit mode)
  const skipNextAutoSaveRef = useRef(false);

  const didSend = useRef(false);

  // Only run on mount
  useEffect(() => {
    if (!ws) return;
    if (mode !== "create" && mode !== "edit") return;
    console.log("[DEBUG] useEffect 1");
    
    // Store current config reference to use inside effect
    const currentConfig = mode === "edit" ? config : null;
    
    setLoading(true);
    const sendCreationInfo = () => {
      if (ws.readyState === WebSocket.OPEN && !didSend.current) {
        didSend.current = true;
        ws.send(JSON.stringify({ command: "config_creation_info", args: [] }));
      }
    };
    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "ok" && data.registry && data.default_config) {
          setRegistry(data.registry);
          setDefaults(data.default_config);
          
          // For edit mode: set form values from config
          if (mode === "edit" && currentConfig) {
            // Parse content JSON to get component paths and settings
            const parsed = parseContent(currentConfig.content);
            // Set skipNextAutoSaveRef to true before setting form
            skipNextAutoSaveRef.current = true;
            setForm((prev) => ({
              ...prev,
              name: currentConfig.name,
              ...Object.fromEntries(
                COMPONENTS.map((c) => {
                  const path = parsed[c]?.path || "";
                  const settings = parsed[c]?.settings || {};
                  return [c, { path, settings }];
                })
              ),
            }));
          }
          // Note: Create mode initialization moved to separate effect
        }
        setLoading(false);
      } catch (e) {
        console.error("[DEBUG] Error handling message:", e);
      }
    };
    if (ws.readyState === WebSocket.OPEN) {
      sendCreationInfo();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.addEventListener("open", sendCreationInfo, { once: true });
    }
    ws.addEventListener("message", handleMessage);
    return () => {
      if (!didSend.current && ws.readyState === WebSocket.CONNECTING) {
        ws.removeEventListener("open", sendCreationInfo, { once: true });
      }
      ws.removeEventListener("message", handleMessage);
    };
  }, []);

  // If config prop changes in edit mode, update form
  // useEffect(() => {
  //   if (mode === "edit" && config) {
  //     console.log("[DEBUG] useEffect 2");
  //     const parsed = parseContent(config.content);
  //     // Set skipNextAutoSaveRef to true before setting form
  //     skipNextAutoSaveRef.current = true;
  //     setForm((prev) => ({
  //       ...prev,
  //       name: config.name,
  //       ...Object.fromEntries(
  //         COMPONENTS.map((c) => {
  //           const path = parsed[c]?.path || "";
  //           const settings = parsed[c]?.settings || {};
  //           return [c, { path, settings }];
  //         })
  //       ),
  //     }));
  //   }
  // }, [config]);
  
  // NEW EFFECT: Initialize form state for CREATE mode after registry/defaults are loaded
  useEffect(() => {
    if (
      mode === "create" &&
      registry &&
      Object.keys(registry).length > 0 &&
      defaults &&
      Object.keys(defaults).length > 0
    ) {
      console.log("[DEBUG] useEffect 3");
      setForm((prev) => ({
        ...prev,
        ...Object.fromEntries(
          COMPONENTS.map((c) => {
            const path = defaults[c]?.path || "";
            // Get default settings from registry
            let settings = {};
            if (
              registry &&
              registry[c] &&
              registry[c][path] &&
              Array.isArray(registry[c][path]) &&
              registry[c][path].length > 2
            ) {
              settings = registry[c][path][2] || {};
            }
            return [c, { path, settings }];
          })
        ),
      }));
    }
  }, [registry, defaults]);

  // Open script editor when componentContent is set
  useEffect(() => {
    if (mode === "edit" && config && componentContent) {
      console.log("[DEBUG] useEffect 4");
      const [compName, compPath] = componentContent;
      if (compName && compPath) {
        openScriptEditorPopup(compPath.slice(0, compPath.lastIndexOf(".")));
      }
      setComponentContent(null); // Reset trigger
    }
  }, [componentContent, config]);

  // Instant auto-save on every change in edit+autoSave mode, but not on initial load
  useEffect(() => {
    if (
      mode === "edit" &&
      autoSave &&
      typeof ws !== "undefined" &&
      config &&
      (form.name || form.indexer?.path || form.retriever?.path || form.augmenter?.path || form.generator?.path)
    ) {
      console.log("[DEBUG] useEffect 5");
      if (skipNextAutoSaveRef.current) {
        // Skip this auto-save, reset the flag
        skipNextAutoSaveRef.current = false;
        return;
      }
      
      // Only notify parent via onAutoSave, don't send update_config here
      if (typeof onAutoSave === "function") {
        onAutoSave(form); // Always sends the latest form value
      }
      if (typeof onConfigsChanged === "function") {
        onConfigsChanged();
      }
    }
  }, [form]);

  const handleChange = (e) => {
    // Always reset skipNextAutoSaveRef so user changes are never skipped
    skipNextAutoSaveRef.current = false;
    const { name, value } = e.target;
    
    // When changing path, also update settings to the new default from registry
    let newSettings = {};
    if (
      registry &&
      registry[name] &&
      registry[name][value] &&
      Array.isArray(registry[name][value]) &&
      registry[name][value].length > 2
    ) {
      newSettings = registry[name][value][2] || {};
    }
    
    setForm((prev) => ({
      ...prev,
      [name]: { 
        path: value,
        settings: newSettings
      }
    }));
  };
  
  // Handler for settings change
  const handleSettingsChange = (comp, key, value) => {
    skipNextAutoSaveRef.current = false;
    setForm((prev) => ({
      ...prev,
      [comp]: {
        ...prev[comp],
        settings: {
          ...prev[comp].settings,
          [key]: value
        }
      }
    }));
  };

  // "To defaults" button for edit mode
  const handleToDefaults = () => {
    if (defaults) {
      setForm((prev) => ({
        ...prev,
        // keep name as is
        ...Object.fromEntries(
          COMPONENTS.map((c) => {
            const path = defaults[c]?.path || "";
            // Get default settings from registry
            let settings = {};
            if (
              registry &&
              registry[c] &&
              registry[c][path] &&
              Array.isArray(registry[c][path]) &&
              registry[c][path].length > 2
            ) {
              settings = registry[c][path][2] || {};
            }
            return [c, { path, settings }];
          })
        ),
      }));
    }
  };

  // Handlers for MonacoCodeEditorPopup
  const handleEditorSave = (newLines) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ command: "update_script", args: [editorPopup.compPath, newLines] }));
    const handleResponse = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "ok") {
          // console.log(`[DEBUG] Component script updated successfully: ${data.message}`);
          // if (typeof onAutoSave === "function") {
          //   onAutoSave(form);
          // }
          setEditorPopup({ open: false, code: "", compName: "", compPath: "" });
          setEditorError(null); // Clear error on success
          refreshRegistry(); // Refresh registry after saving
        } else if (data.status === "error") {
          console.error(`[ERROR] Failed to update component script: ${data.message}`);
          setEditorError(data.message || "Error updating component script");
        }
      } catch (e) {}
      ws.removeEventListener("message", handleResponse);
    };
    ws.addEventListener("message", handleResponse);
  };

  const handleEditorClose = () => {
    // console.log(`[DEBUG] Editor closed without saving. Component: ${editorPopup.compName} (${editorPopup.compPath})`);
    setEditorPopup({ open: false, code: "", compName: "", compPath: "" });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Build config JSON from component selectors
    const content = buildContent(form, registry, mode);

    if (mode === "create") {
      const message = {
        command: "config",
        args: [
          form.name,
          "calculation",
          content,
        ],
      };
      const handleResponse = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.status === "ok") {
            ws.removeEventListener("message", handleResponse);
            setSubmitting(false);
            onCreated && onCreated();
            onClose && onClose();
          } else if (data.status === "error") {
            setError(data.message || "Error creating config");
            setSubmitting(false);
          }
        } catch (e) {}
      };
      ws.addEventListener("message", handleResponse);
      ws.send(JSON.stringify(message));
    } else if (mode === "edit" && config) {
      // In edit mode, just call onUpdated/onClose if provided
      // Do NOT send update_config here - parent component is responsible for that
      setSubmitting(false);
      onUpdated && onUpdated();
      onClose && onClose();
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="p-3">
        <h5>{mode === "edit" ? "(editable)" : "Create New Config"}</h5>
        <div className="mb-3">
          <label className="form-label">Name</label>
          <input
            className="form-control"
            name="name"
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            required
            disabled={submitting}
          />
        </div>
        {COMPONENTS.map((comp) => (
          <div key={comp}>
            <ItemSelector
              label={comp}
              name={comp}
              value={form[comp]?.path || ""}
              options={registry[comp] || {}}
              onChange={handleChange}
              disabled={submitting}
              onLinkClick={handleSelectorLinkClick}
              onCreate={() => handleComponentCreate(comp)}
            />
            <SettingsField
              settings={form[comp]?.settings || {}}
              onChange={(key, value) => handleSettingsChange(comp, key, value)}
              disabled={submitting}
            />
          </div>
        ))}
        {mode === "edit" && defaults && (
          <button
            type="button"
            className="btn btn-outline-secondary mb-3"
            onClick={handleToDefaults}
            disabled={submitting}
          >
            To defaults
          </button>
        )}
        {error && <div className="alert alert-danger">{error}</div>}
        {!(mode === "edit" && autoSave) && (
          <div className="d-flex justify-content-end">
            <button
              type="button"
              className="btn btn-secondary me-2"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting
                ? mode === "edit"
                  ? "Saving..."
                  : "Creating..."
                : mode === "edit"
                ? "Save"
                : "Create"}
            </button>
          </div>
        )}
      </form>
      {editorPopup.open && (
        <MonacoCodeEditorPopup
          lines={editorPopup.lines || []}
          onSave={handleEditorSave}
          onClose={handleEditorClose}
          language="python"
          title={`${editorPopup.compName}: ${stripCaretDotPrefixes(editorPopup.compPath)}`}
        />
      )}
      {editorError && <div className="alert alert-danger">{editorError}</div>}
      {scriptEditorPopup.open && (
        <MonacoCodeEditorPopup
          lines={scriptEditorPopup.code}
          onSave={handleScriptEditorSave}
          onClose={handleScriptEditorClose}
          language="python"
          title={stripCaretDotPrefixes(scriptEditorPopup.path)}
        />
      )}
      {scriptEditorError && <div className="alert alert-danger">{scriptEditorError}</div>}
      {fileSelector.open && (
        <ComponentFileSelector
          open={fileSelector.open}
          files={Object.fromEntries(
            visibleFiles.map((filePath) => [filePath, filePath])
          )}
          onSelect={handleFileSelected}
          onCreate={handleFileCreated}
          onClose={handleFileSelectorClose}
          title={`Select or create file for ${fileSelector.compName}`}
          error={fileSelector.error}
          creating={fileSelector.creating}
        />
      )}
    </>
  );
};

export default ConfigCreateForm;
