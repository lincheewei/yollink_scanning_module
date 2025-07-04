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
  const [jtcInfo, setJtcInfo] = useState(null);
  const binInputRef = useRef(null);
  const componentInputRef = useRef(null);
  const jtcInputRef = useRef(null);

  const focusActiveInput = () => {
    if (currentStep === 0 && binInputRef.current) binInputRef.current.focus();
    else if (currentStep === 1 && componentInputRef.current) componentInputRef.current.focus();
    else if (currentStep === 2 && jtcInputRef.current) jtcInputRef.current.focus();
  };

  // Helper to check positive number
  const isPositiveNumber = (val) => typeof val === "number" && val > 0;

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
      setJtcInfo(null);
      if (onStepChange) onStepChange(0);
    }
  }));

  useEffect(() => {
    const handleGlobalClick = (e) => {
      const tag = e.target.tagName.toLowerCase();
      const isButton = tag === 'button' || e.target.closest('button');
      const isModal = e.target.closest('.modal') || e.target.classList.contains('modal');

      if (!isButton && !isModal) {
        focusActiveInput();
      }
    };

    document.addEventListener("click", handleGlobalClick);

    return () => {
      document.removeEventListener("click", handleGlobalClick);
    };
  }, [currentStep]);

  useEffect(() => {
    if (currentStep === 0) {
      binInputRef.current?.focus();
    } else if (currentStep === 1) {
      componentInputRef.current?.focus();
    } else if (currentStep === 2) {
      jtcInputRef.current?.focus();
    }
  }, [currentStep]);

  // Check if all components have valid scale readings (all > 0)
  const allComponentsHaveScaleReadings = () => {
    return scannedComponents.length > 0 && scannedComponents.every((compId) => {
      const data = componentData[compId];
      return data && !data.loading &&
        isPositiveNumber(data.net_kg) &&
        isPositiveNumber(data.pcs) &&
        isPositiveNumber(data.unit_weight_g);
    });
  };

  // Helper for readiness count
  const readyCount = scannedComponents.filter((compId) => {
    const data = componentData[compId];
    return data && !data.loading &&
      isPositiveNumber(data.net_kg) &&
      isPositiveNumber(data.pcs) &&
      isPositiveNumber(data.unit_weight_g);
  }).length;

  const fetchScaleReading = async (componentId) => {
    setComponentData(prev => ({
      ...prev,
      [componentId]: {
        ...(prev[componentId] || {}),
        loading: true,
      }
    }));

    try {
      const response = await axios.get("http://localhost:8000/get_weight");

      if (response.status === 204 || !response.data) {
        setComponentData(prev => ({
          ...prev,
          [componentId]: {
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

      const validNetKg = isPositiveNumber(scaleData.net_kg) ? scaleData.net_kg : null;
      const validPcs = isPositiveNumber(scaleData.pcs) ? scaleData.pcs : null;
      const validUnitWeight = isPositiveNumber(scaleData.unit_weight_g) ? scaleData.unit_weight_g : null;

      setComponentData(prev => ({
        ...prev,
        [componentId]: {
          componentId,
          loading: false,
          net_kg: validNetKg,
          pcs: validPcs,
          unit_weight_g: validUnitWeight,
          timestamp: scaleData.timestamp || null,
          serial_no: scaleData.serial_no || null,
          error: (validNetKg && validPcs && validUnitWeight) ? null : "Invalid weight reading"
        }
      }));
    } catch (error) {
      console.error("Error fetching scale reading:", error);
      setComponentData(prev => ({
        ...prev,
        [componentId]: {
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

  const handleBinScan = async (bin) => {
    if (!bin.trim()) return;

    const normalized = bin.trim().toUpperCase();
    setBinId(normalized);
    setMessage("");

    try {
      const res = await axios.get(`/api/bin-info/${normalized}`);
      const rawData = res.data.bin;
      console.log("Raw data from API:", rawData);
      // 收集非空组件字段
      const components = [
        rawData.component_1,
        rawData.component_2,
        rawData.component_3,
        rawData.component_4,
      ].filter((comp) => typeof comp === "string" && comp.trim() !== "");

      if (components.length === 0) {
        setMessage("❌ No components found for this bin.");
        setShowMessageModal(true);
        return;
      }

      setScannedComponents(components);

      // 并行读取秤重（可选：也可以用 for..of 按顺序来）
      await Promise.all(
        components.map((compId) => fetchScaleReading(compId))
      );

      if (onStepChange) onStepChange(1);
    } catch (err) {
      console.error("❌ Failed to fetch components for bin:", err);
      setMessage("❌ Error fetching bin components.");
      setShowMessageModal(true);
    }
  };
  const handleJtcScan = async (jtc) => {
    const normalized = jtc.trim().replace(/^(\*j)/i, "").toUpperCase();
    if (!normalized) return;

    setLoading(true);
    try {
      const response = await axios.get(`/api/jtc-info/${normalized}`);
      const jtcData = response.data.jtc;
      console.log("JTC Data:", jtcData);
      setJtcId(normalized);
      setJtcInfo(jtcData); // ✅ store detailed info
      setMessage("");
    } catch (error) {
      setMessage("JTC not found for scanned barcode.");
      setShowMessageModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handlePrintLabel = async () => {
    try {


      const labelData = {
        woNumber: jtcInfo.jtc_id,
        partName: jtcInfo.jtc_PartNumber || jtcInfo.jtc_PartNo || "",
        dateIssue: jtcInfo.jtc_createdAt || "",
        stockCode: "",
        processCode: "",
        empNo: "",
        qty: jtcInfo.jtc_quantityNeeded || "",
        remarks: jtcInfo.jtc_orderNumber || "",
        jtc_barcodeId: jtcInfo.jtc_barcodeId || "",
      };

      console.log("Printing labels... prininfo:", labelData);

      await fetch('/api/print-work-order-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          labelData

        )
      });
      // Optional: Give feedback to the user (toast/snackbar/message)
    } catch (err) {
      alert('Print failed!');
    }
  };

  const handleKeyDown = (e, type) => {
    if (e.key === "Enter") {
      e.preventDefault(); // ⛔ 阻止默认行为（避免触发表单提交或按钮点击）

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
    const removedComponent = scannedComponents[idx];

    const newComponents = scannedComponents.filter((_, i) => i !== idx);
    setScannedComponents(newComponents);

    // Remove the corresponding componentData by component ID
    const newComponentData = { ...componentData };
    delete newComponentData[removedComponent];
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
      const quantities = scannedComponents.map((compId) => componentData[compId]?.pcs || null);
      const expectedWeights = scannedComponents.map((compId) => componentData[compId]?.net_kg || null);
      const actualWeights = expectedWeights; // Same as expected

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
        if (jtcInfo) {
          handlePrintLabel();
        }
        const statusMessage = jtcId
          ? `Successfully saved bin ${binId} with ${scannedComponents.length} component(s). Status: Ready for Release.`
          : `Successfully saved bin ${binId} with ${scannedComponents.length} component(s). Status: Pending JTC Assignment.`;

        setMessage(statusMessage);
        setShowMessageModal(true);

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
    setJtcInfo(null);
    setMessage("");
    setShowMessageModal(false);
    if (onStepChange) onStepChange(0);
  };

  const closeMessageModal = () => {
    handleReset();
    focusActiveInput();

  };

  const openImageModal = (imageSrc) => {
    setSelectedImage(imageSrc);
    setShowImageModal(true);
  };

  const closeImageModal = () => {

    setShowImageModal(false);
    setSelectedImage("");
    focusActiveInput();

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

            {/* JTC Status and Confirm Button in one row */}
            <div className="max-w-5xl mx-auto mt-6">
              <div className="flex flex-col lg:flex-row items-stretch gap-6">

                {/* Status Info Box */}
                <div className={`flex-1 p-6 rounded-xl shadow-lg border-l-8 ${jtcId
                  ? "bg-gradient-to-r from-green-500 to-green-600 text-white border-green-700"
                  : "bg-gradient-to-r from-yellow-500 to-yellow-600 text-white border-yellow-700"
                  }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-white bg-opacity-20 p-3 rounded-full">
                        <span className="text-2xl">{jtcId ? "✅" : "⏳"}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium uppercase tracking-wide opacity-90">
                          {jtcId ? "Ready for Release" : "No JTC Assignment"}
                        </p>
                        <p className="text-xl font-bold font-mono">
                          JTC: {jtcInfo?.jtc_orderNumber || jtcId || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs opacity-80">
                    {jtcId
                      ? "This bin will be assigned to this JTC"
                      : "Scan JTC above to assign this bin to a JTC"}
                  </p>
                </div>

                {/* Confirm & Save Button */}
                <div className="w-full lg:w-1/3 flex flex-col justify-center">
                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm text-center">
                    <span className="font-semibold">
                      {readyCount} / {scannedComponents.length} components ready
                    </span>
                    <button
                      onClick={handleConfirmSave}
                      disabled={loading || !allComponentsHaveScaleReadings()}
                      className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors text-sm ${loading || !allComponentsHaveScaleReadings()
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-green-600 text-white hover:bg-green-700"
                        }`}
                    >
                      {loading
                        ? "Saving..."
                        : allComponentsHaveScaleReadings()
                          ? "✅ Confirm & Save"
                          : "⚠️ Complete Scale Readings First"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Current Bin Display */}
            {binId && (
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg border-l-8 border-blue-700">
                <div className="flex items-center justify-between min-h-[96px]"> {/* 设置最小高度 */}
                  {/* 左侧图标与 Bin 文字 */}
                  <div className="flex items-center space-x-4">
                    <div className="bg-white bg-opacity-20 p-3 rounded-full flex items-center justify-center">
                      <span className="text-2xl">📦</span>
                    </div>
                    <div className="flex flex-col justify-center">
                      <h2 className="text-sm font-medium text-blue-100 uppercase tracking-wide">
                        Current Bin
                      </h2>
                      <p className="text-2xl font-bold font-mono">{binId}</p>
                    </div>
                  </div>

                  {/* 右侧统计 */}
                  <div className="text-right flex flex-col justify-center">
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
                    const data = componentData[component]; // ✅
                    const ready = data && !data.loading &&
                      isPositiveNumber(data.net_kg) &&
                      isPositiveNumber(data.pcs) &&
                      isPositiveNumber(data.unit_weight_g);
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
                                      {data.unit_weight_g != null
                                        ? `${data.unit_weight_g}g`
                                        : "N/A"
                                      }
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600 font-medium">Quantity:</span>
                                    <span className="font-semibold">
                                      {data.pcs != null
                                        ? `${data.pcs} pcs`
                                        : "N/A"
                                      }
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600 font-medium">Total Weight:</span>
                                    <span className="font-semibold">
                                      {data.net_kg != null
                                        ? `${data.net_kg}kg`
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

                  </div>
                  <div className="flex justify-center gap-4">
                    <button
                      onClick={() => onStepChange && onStepChange(1)}
                      className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      ← Back to Scan Components
                    </button>

                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {binId && currentStep === 1 && (
          <div className="max-w-7xl mx-auto mb-6">
            <div className="flex flex-col lg:flex-row gap-6 items-center"> {/* from items-stretch 改为 items-center */}

              {/* Current Bin Display */}
              <div className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg border-l-8 border-blue-700 min-h-[120px] flex items-center">
                <div className="flex items-center justify-between w-full">
                  {/* 左侧图标与 Bin 文字 */}
                  <div className="flex items-center space-x-4">
                    <div className="bg-white bg-opacity-20 p-3 rounded-full">
                      <span className="text-2xl">📦</span>
                    </div>
                    <div>
                      <h2 className="text-sm font-medium text-blue-100 uppercase tracking-wide">Current Bin</h2>
                      <p className="text-2xl font-bold font-mono">{binId}</p>
                    </div>
                  </div>

                  {/* 右侧统计 */}
                  <div className="text-right">
                    <p className="text-sm text-blue-100">Components Scanned</p>
                    <p className="text-3xl font-bold">{scannedComponents.length}</p>
                  </div>
                </div>
              </div>

              {/* Review Button */}
              <div className="flex flex-col justify-center items-center w-full lg:w-1/3">
                <div className="w-full bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800 mb-4 text-center">
                  <p className="font-semibold text-sm mb-1">⚠️ Scale Readings</p>
                  <p className="text-xs">
                    {readyCount} / {scannedComponents.length} ready
                  </p>
                </div>
                <button
                  onClick={handleNextToReview}
                  disabled={!allComponentsHaveScaleReadings()}
                  className={`w-full px-6 py-4 text-base rounded-lg font-semibold transition-colors ${allComponentsHaveScaleReadings()
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    }`}
                >
                  {allComponentsHaveScaleReadings()
                    ? "📋 Review & Confirm →"
                    : "⚠️ Complete Scale Readings First"}
                </button>
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
                  const data = componentData[component];
                  const ready = data && !data.loading &&
                    isPositiveNumber(data.net_kg) &&
                    isPositiveNumber(data.pcs) &&
                    isPositiveNumber(data.unit_weight_g);
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
                            {data?.loading ? (
                              <div className="flex items-center">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                                <span className="text-sm text-blue-600">Reading...</span>
                              </div>
                            ) : ready ? (
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-medium">Unit Weight:</span>
                                  <span className="font-semibold">
                                    {data.unit_weight_g != null
                                      ? `${data.unit_weight_g}g`
                                      : "N/A"
                                    }
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-medium">Quantity:</span>
                                  <span className="font-semibold">
                                    {data.pcs != null
                                      ? `${data.pcs} pcs`
                                      : "N/A"
                                    }
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-medium">Total Weight:</span>
                                  <span className="font-semibold">
                                    {data.net_kg != null
                                      ? `${data.net_kg}kg`
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
                                onClick={() => fetchScaleReading(component)}
                                disabled={data?.loading}
                                className={`w-full px-3 py-2 rounded transition-colors text-xs ${data?.loading
                                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                  : ready
                                    ? "bg-green-600 text-white hover:bg-green-700"
                                    : "bg-blue-600 text-white hover:bg-blue-700"
                                  }`}
                              >
                                {data?.loading
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
            <div className="flex justify-center gap-3">
              {message.startsWith("Successfully") && (
                <button
                  onClick={handlePrintLabel}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                >
                  🖨️ Print Label
                </button>
              )}
              <button
                onClick={closeMessageModal}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
              >
                Close
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