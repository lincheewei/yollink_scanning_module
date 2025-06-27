import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import axios from "axios";

const ScanBinItems = forwardRef(({ currentStep, onStepChange }, ref) => {
  const [binId, setBinId] = useState("");
  const [scannedComponents, setScannedComponents] = useState([]);
  const [componentData, setComponentData] = useState({});
  const [jtcId, setJtcId] = useState("");
  const [message, setMessage] = useState("");
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState("");
  const [loading, setLoading] = useState(false);

  const binInputRef = useRef(null);
  const componentInputRef = useRef(null);
  const jtcInputRef = useRef(null);

  // Expose reset function to parent
  useImperativeHandle(ref, () => ({
    resetComponent: () => {
      setBinId("");
      setScannedComponents([]);
      setComponentData({});
      setJtcId("");
      setMessage("");
      setShowMessageModal(false);
      setShowImageModal(false);
      setSelectedImage("");
      setLoading(false);
      if (onStepChange) onStepChange(0);
    }
  }));

  useEffect(() => {
    if (currentStep === 0) {
      binInputRef.current?.focus();
    } else if (currentStep === 1) {
      componentInputRef.current?.focus();
    } else if (currentStep === 2) {
      jtcInputRef.current?.focus();
    }
  }, [currentStep]);

  // Check if all components have scale readings
  const allComponentsHaveScaleReadings = () => {
    return scannedComponents.length > 0 && scannedComponents.every((_, idx) => 
      componentData[idx] && 
      !componentData[idx].loading && 
      componentData[idx].net_kg !== null
    );
  };

  // Helper for readiness count
  const readyCount = scannedComponents.filter((_, idx) => 
    componentData[idx] && !componentData[idx].loading && componentData[idx].net_kg !== null
  ).length;

  const fetchScaleReading = async (componentId, idx) => {
    if (!componentData[idx]) {
      setComponentData(prev => ({
        ...prev,
        [idx]: { 
          componentId, 
          loading: true, 
          net_kg: null, 
          pcs: null, 
          unit_weight_g: null,
          timestamp: null,
          serial_no: null
        }
      }));
    } else {
      setComponentData(prev => ({
        ...prev,
        [idx]: { ...prev[idx], loading: true }
      }));
    }

    try {
      const response = await axios.get("http://localhost:8000/get_weight");

      if (response.status === 204 || !response.data) {
        // No data yet from scale
        setComponentData(prev => ({
          ...prev,
          [idx]: {
            componentId,
            loading: false,
            net_kg: null,
            pcs: null,
            unit_weight_g: null,
            timestamp: null,
            serial_no: null,
            error: "No scale data available"
          }
        }));
        return;
      }

      const scaleData = response.data;

      // Validate scaleData fields
      const isValidWeight = typeof scaleData.net_kg === "number" && scaleData.net_kg > 0;

      setComponentData(prev => ({
        ...prev,
        [idx]: {
          componentId,
          loading: false,
          net_kg: isValidWeight ? scaleData.net_kg : null,
          pcs: scaleData.pcs != null ? scaleData.pcs : null,
          unit_weight_g: scaleData.unit_weight_g != null ? scaleData.unit_weight_g : null,
          timestamp: scaleData.timestamp || null,
          serial_no: scaleData.serial_no || null,
          error: isValidWeight ? null : "Invalid weight reading"
        }
      }));
    } catch (error) {
      console.error("Error fetching scale reading:", error);
      setComponentData(prev => ({
        ...prev,
        [idx]: {
          componentId,
          loading: false,
          net_kg: null,
          pcs: null,
          unit_weight_g: null,
          timestamp: null,
          serial_no: null,
          error: "Failed to get scale reading"
        }
      }));
    }
  };

  const handleBinScan = (bin) => {
    if (!bin.trim()) return;
    setBinId(bin.trim());
    setMessage("");
    if (onStepChange) onStepChange(1);
  };

  const handleComponentScan = async (componentId) => {
    if (!componentId.trim()) return;
    
    if (scannedComponents.includes(componentId.trim())) {
      setMessage(`Component ${componentId} is already scanned.`);
      setShowMessageModal(true);
      return;
    }

    const newComponents = [...scannedComponents, componentId.trim()];
    setScannedComponents(newComponents);
    
    const idx = newComponents.length - 1;
    await fetchScaleReading(componentId.trim(), idx);
    
    setMessage("");
  };

  const handleJtcScan = (jtc) => {
    if (!jtc.trim()) return;
    setJtcId(jtc.trim());
    setMessage("");
  };

  const handleKeyDown = (e, type) => {
    if (e.key === "Enter") {
      if (type === "bin") {
        handleBinScan(e.target.value);
        e.target.value = "";
      } else if (type === "component") {
        handleComponentScan(e.target.value);
        e.target.value = "";
      } else if (type === "jtc") {
        handleJtcScan(e.target.value);
        e.target.value = "";
      }
    }
  };

  const clearComponent = (idx) => {
    const newComponents = scannedComponents.filter((_, i) => i !== idx);
    setScannedComponents(newComponents);
    
    const newComponentData = {};
    newComponents.forEach((comp, i) => {
      if (componentData[i]) {
        newComponentData[i] = componentData[i];
      }
    });
    setComponentData(newComponentData);
  };

  const handleNextToReview = () => {
    if (!allComponentsHaveScaleReadings()) {
      setMessage("Please get scale readings for all components before proceeding.");
      setShowMessageModal(true);
      return;
    }
    if (onStepChange) onStepChange(2);
  };

  const handleConfirmSave = async () => {
    if (!binId || scannedComponents.length === 0) {
      setMessage("Please scan bin and at least one component before saving.");
      setShowMessageModal(true);
      return;
    }

    if (!allComponentsHaveScaleReadings()) {
      setMessage("Please get scale readings for all components before saving.");
      setShowMessageModal(true);
      return;
    }

    setLoading(true);
    setMessage("Saving bin information...");
    setShowMessageModal(true);

    try {
      // Prepare arrays for backend
      const components = scannedComponents;
      const quantities = scannedComponents.map((_, idx) => componentData[idx]?.pcs || null);
      const expectedWeights = scannedComponents.map((_, idx) => componentData[idx]?.net_kg || null);
      const actualWeights = expectedWeights; // Same as expected for now

      const payload = {
        binId,
        jtc: jtcId || null,
        components,
        quantities,
        expectedWeights,
        actualWeights
      };

      const response = await axios.post("/api/save-scan-data", payload);

      if (response.data.success) {
        const statusMessage = jtcId 
          ? `Successfully saved bin ${binId} with ${scannedComponents.length} component(s). Status: Ready for Release.`
          : `Successfully saved bin ${binId} with ${scannedComponents.length} component(s). Status: Pending JTC Assignment.`;
        
        setMessage(statusMessage);
        setShowMessageModal(true);
        setTimeout(() => {
          handleReset();
        }, 3000);
      } else {
        setMessage(response.data.error || "Error saving bin information.");
        setShowMessageModal(true);
      }
    } catch (error) {
      setMessage(error.response?.data?.error || "Network or server error.");
      setShowMessageModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setBinId("");
    setScannedComponents([]);
    setComponentData({});
    setJtcId("");
    setMessage("");
    setShowMessageModal(false);
    if (onStepChange) onStepChange(0);
  };

  const closeMessageModal = () => {
    setShowMessageModal(false);
    setMessage("");
  };

  const openImageModal = (imageSrc) => {
    setSelectedImage(imageSrc);
    setShowImageModal(true);
  };

  const closeImageModal = () => {
    setShowImageModal(false);
    setSelectedImage("");
  };

  return (
    <div>
      <div className="space-y-6">
        {/* Step 1: Bin Scan */}
        {currentStep === 0 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-4">
              <label className="text-lg font-semibold text-gray-700 whitespace-nowrap">
                📦 Scan Bin:
              </label>
              <input
                ref={binInputRef}
                type="text"
                className="border-2 border-blue-300 rounded-lg px-4 py-3 flex-1 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onKeyDown={(e) => handleKeyDown(e, "bin")}
                placeholder="📱 Scan bin barcode and press Enter"
                disabled={loading}
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Step 2: Component Scan */}
        {currentStep === 1 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
              <label className="text-lg font-semibold text-gray-700 whitespace-nowrap">
                🔧 Scan Component:
              </label>
              <input
                ref={componentInputRef}
                type="text"
                className="border-2 border-blue-300 rounded-lg px-4 py-3 flex-1 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onKeyDown={(e) => handleKeyDown(e, "component")}
                placeholder="📱 Scan component barcode and press Enter"
                disabled={loading}
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Step 3: Review & Confirm (with optional JTC) */}
        {currentStep === 2 && (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* JTC Input at Top */}
            <div className="flex items-center gap-4 max-w-2xl mx-auto">
              <label className="text-lg font-semibold text-gray-700 whitespace-nowrap">
                🏷️ Scan JTC (Optional):
              </label>
              <input
                ref={jtcInputRef}
                type="text"
                className="border-2 border-purple-300 rounded-lg px-4 py-3 flex-1 text-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                onKeyDown={(e) => handleKeyDown(e, "jtc")}
                placeholder="📱 Scan JTC work order (Optional)"
                disabled={loading}
                autoFocus
              />
            </div>

            {/* Status Information */}
            <div className="max-w-md mx-auto">
              <div className={`p-4 rounded-lg shadow-lg text-center ${
                jtcId 
                  ? "bg-gradient-to-r from-green-500 to-green-600 text-white" 
                  : "bg-gradient-to-r from-yellow-500 to-yellow-600 text-white"
              }`}>
                <div className="flex items-center justify-center gap-3 mb-2">
                  <span className="text-2xl">
                    {jtcId ? "✅" : "⏳"}
                  </span>
                  <div>
                    <p className="text-sm font-medium opacity-90 uppercase tracking-wide">
                      {jtcId ? "Ready for Release" : "Pending JTC Assignment"}
                    </p>
                    <p className="text-lg font-bold">
                      {jtcId ? `JTC: ${jtcId}` : "No JTC Assigned"}
                    </p>
                  </div>
                </div>
                <p className="text-xs opacity-80">
                  {jtcId 
                    ? "This bin will be marked as ready for release" 
                    : "Scan JTC above to mark as ready for release"
                  }
                </p>
              </div>
            </div>

            {/* Current Bin Display */}
            {binId && (
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg border-l-8 border-blue-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="bg-white bg-opacity-20 p-3 rounded-full">
                      <span className="text-2xl">📦</span>
                    </div>
                    <div>
                      <h2 className="text-sm font-medium text-blue-100 uppercase tracking-wide">Current Bin</h2>
                      <p className="text-2xl font-bold font-mono">{binId}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-blue-100">Components Scanned</p>
                    <p className="text-3xl font-bold">{scannedComponents.length}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Scanned Components Display - Review Mode (No Scale Buttons) */}
            {scannedComponents.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="font-semibold text-blue-800 mb-6 text-xl">
                  🔧 Scanned Components ({scannedComponents.length}) - Ready for Save
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {scannedComponents.map((component, idx) => {
                    const ready = componentData[idx] && !componentData[idx].loading && componentData[idx].net_kg !== null;
                    return (
                      <div key={idx} className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-4">
                          {/* Component Image - 30% */}
                          <div className="flex-shrink-0 flex items-center justify-center basis-1/3">
                            <div className="w-32 h-32 bg-gray-100 rounded border overflow-hidden cursor-pointer hover:shadow-lg transition-shadow flex items-center justify-center">
                              <img
                                src={`src/assets/components/${component}.jpg`}
                                alt={component}
                                className="w-full h-full object-contain"
                                onClick={() => openImageModal(`src/assets/components/${component}.jpg`)}
                                onError={(e) => {
                                  if (e.target.src.endsWith('.jpg')) {
                                    e.target.src = `src/assets/components/${component}.png`;
                                  } else if (e.target.src.endsWith('.png')) {
                                    e.target.src = `src/assets/components/${component}.jpeg`;
                                  } else {
                                    e.target.src = "https://placehold.co/128x128?text=No+Img";
                                  }
                                }}
                              />
                            </div>
                          </div>

                          {/* Component Info - 70% */}
                          <div className="flex-1 basis-2/3 min-w-0">
                            <div className="flex items-center justify-between mb-3">
                              <span className="font-mono text-gray-700 font-semibold text-sm truncate">
                                {idx + 1}. {component}
                              </span>
                              <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded
                                ${ready ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                {ready ? (
                                  <>
                                    <span className="text-lg">✅</span> Ready
                                  </>
                                ) : (
                                  <>
                                    <span className="text-lg">⚠️</span> Not Ready
                                  </>
                                )}
                              </span>
                            </div>

                            {/* Weight Information - Read Only in Review Mode */}
                            <div className={`border rounded p-3 ${ready ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                              <h5 className={`text-xs font-semibold mb-2 ${ready ? 'text-green-700' : 'text-red-700'}`}>
                                {ready ? '✅ Weight Information Confirmed:' : '⚠️ Weight Information Missing:'}
                              </h5>
                              {ready ? (
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-gray-600 font-medium">Unit Weight:</span>
                                    <span className="font-semibold">
                                      {componentData[idx].unit_weight_g != null
                                        ? `${componentData[idx].unit_weight_g}g`
                                        : "N/A"
                                      }
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600 font-medium">Quantity:</span>
                                    <span className="font-semibold">
                                      {componentData[idx].pcs != null
                                        ? `${componentData[idx].pcs} pcs`
                                        : "N/A"
                                      }
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600 font-medium">Total Weight:</span>
                                    <span className="font-semibold">
                                      {componentData[idx].net_kg != null
                                        ? `${componentData[idx].net_kg}kg`
                                        : "N/A"
                                      }
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-red-600">Scale reading required before saving</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Readiness Summary and Action Buttons at Bottom */}
                <div className="text-center mt-8">
                  <div className="mb-4 text-sm">
                    <span className="font-semibold">
                      {readyCount} / {scannedComponents.length} components ready
                    </span>
                  </div>
                  <div className="flex justify-center gap-4">
                    <button
                      onClick={() => onStepChange && onStepChange(1)}
                      className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      ← Back to Components
                    </button>
                    <button
                      onClick={handleConfirmSave}
                      disabled={loading || !allComponentsHaveScaleReadings()}
                      className={`px-8 py-3 rounded-lg font-semibold transition-colors ${
                        loading || !allComponentsHaveScaleReadings()
                          ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                          : "bg-green-600 text-white hover:bg-green-700"
                      }`}
                    >
                      {loading ? "Saving..." : allComponentsHaveScaleReadings() ? `✅ Confirm & Save` : `⚠️ Complete Scale Readings First`}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Current Bin Display - Always Visible for Step 1 */}
        {binId && currentStep === 1 && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg border-l-8 border-blue-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="bg-white bg-opacity-20 p-3 rounded-full">
                    <span className="text-2xl">📦</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-medium text-blue-100 uppercase tracking-wide">Current Bin</h2>
                    <p className="text-2xl font-bold font-mono">{binId}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-blue-100">Components Scanned</p>
                  <p className="text-3xl font-bold">{scannedComponents.length}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scanned Components Display - For Step 1 */}
        {scannedComponents.length > 0 && currentStep === 1 && (
          <div className="max-w-7xl mx-auto mt-8">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-semibold text-blue-800 mb-6 text-xl">
                🔧 Scanned Components ({scannedComponents.length})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {scannedComponents.map((component, idx) => {
                  const ready = componentData[idx] && !componentData[idx].loading && componentData[idx].net_kg !== null;
                  return (
                    <div key={idx} className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-4">
                        {/* Component Image - 30% */}
                        <div className="flex-shrink-0 flex items-center justify-center basis-1/3">
                          <div className="w-32 h-32 bg-gray-100 rounded border overflow-hidden cursor-pointer hover:shadow-lg transition-shadow flex items-center justify-center">
                            <img
                              src={`src/assets/components/${component}.jpg`}
                              alt={component}
                              className="w-full h-full object-contain"
                              onClick={() => openImageModal(`src/assets/components/${component}.jpg`)}
                              onError={(e) => {
                                if (e.target.src.endsWith('.jpg')) {
                                  e.target.src = `src/assets/components/${component}.png`;
                                } else if (e.target.src.endsWith('.png')) {
                                  e.target.src = `src/assets/components/${component}.jpeg`;
                                } else {
                                  e.target.src = "https://placehold.co/128x128?text=No+Img";
                                }
                              }}
                            />
                          </div>
                        </div>

                        {/* Component Info - 70% */}
                        <div className="flex-1 basis-2/3 min-w-0">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-mono text-gray-700 font-semibold text-sm truncate">
                              {idx + 1}. {component}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded
                                ${ready ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                {ready ? (
                                  <>
                                    <span className="text-lg">✅</span> Ready
                                  </>
                                ) : (
                                  <>
                                    <span className="text-lg">⚠️</span> Not Ready
                                  </>
                                )}
                              </span>
                              <button
                                onClick={() => clearComponent(idx)}
                                className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50 transition-colors border border-red-200 flex-shrink-0"
                              >
                                Clear
                              </button>
                            </div>
                          </div>

                          {/* Weight Information */}
                          <div className="bg-gray-50 border border-gray-200 rounded p-3">
                            <h5 className="text-xs font-semibold text-gray-600 mb-2">Weight Information:</h5>
                            {componentData[idx]?.loading ? (
                              <div className="flex items-center">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                                <span className="text-sm text-blue-600">Reading...</span>
                              </div>
                            ) : ready ? (
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-medium">Unit Weight:</span>
                                  <span className="font-semibold">
                                    {componentData[idx].unit_weight_g != null
                                      ? `${componentData[idx].unit_weight_g}g`
                                      : "N/A"
                                    }
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-medium">Quantity:</span>
                                  <span className="font-semibold">
                                    {componentData[idx].pcs != null
                                      ? `${componentData[idx].pcs} pcs`
                                      : "N/A"
                                    }
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-medium">Total Weight:</span>
                                  <span className="font-semibold">
                                    {componentData[idx].net_kg != null
                                      ? `${componentData[idx].net_kg}kg`
                                      : "N/A"
                                    }
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-red-500 font-semibold">⚠️ Scale reading required</span>
                            )}
                            
                            <div className="mt-3">
                              <button
                                onClick={() => fetchScaleReading(component, idx)}
                                disabled={componentData[idx]?.loading}
                                className={`w-full px-3 py-2 rounded transition-colors text-xs ${
                                  componentData[idx]?.loading
                                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                    : ready
                                    ? "bg-green-600 text-white hover:bg-green-700"
                                    : "bg-blue-600 text-white hover:bg-blue-700"
                                }`}
                              >
                                {componentData[idx]?.loading 
                                  ? "Reading..." 
                                  : ready
                                  ? "✅ Reading Complete"
                                  : "📊 Get Scale Reading"
                                }
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Review Button and Summary at Bottom */}
              <div className="text-center mt-8">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 max-w-2xl mx-auto">
                  <p className="text-sm text-yellow-800">
                    ⚠️ Please ensure all components have scale readings before proceeding to review.
                  </p>
                  <p className="text-xs text-yellow-600 mt-1">
                    Components with readings: {readyCount} / {scannedComponents.length}
                  </p>
                </div>
                <button
                  onClick={handleNextToReview}
                  disabled={!allComponentsHaveScaleReadings()}
                  className={`px-8 py-3 rounded-lg font-semibold transition-colors ${
                    allComponentsHaveScaleReadings()
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  {allComponentsHaveScaleReadings() 
                    ? "📋 Review & Confirm →" 
                    : "⚠️ Complete Scale Readings First"
                  }
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Message Display */}
      {message && !showMessageModal && (
        <div className="mt-4 text-center text-sm text-blue-700 p-3 bg-blue-50 rounded-lg">
          {message}
        </div>
      )}

      {/* Message Modal */}
      {showMessageModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={closeMessageModal}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-gray-800 mb-4">{message}</p>
            <div className="flex justify-center">
              <button
                onClick={closeMessageModal}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      {showImageModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={closeImageModal}
        >
          <div className="relative max-w-2xl max-h-full">
            <img
              src={selectedImage}
              alt="Component Preview"
              className="max-w-full max-h-full rounded shadow-lg"
              onError={(e) => {
                e.target.src = "https://placehold.co/400x300?text=Image+Not+Found";
              }}
            />
            <button
              onClick={closeImageModal}
              className="absolute top-4 right-4 bg-white text-black rounded-full w-10 h-10 flex items-center justify-center text-xl font-bold hover:bg-gray-200 transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default ScanBinItems;