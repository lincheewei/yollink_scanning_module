import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle, useMemo } from "react";
import axios from "axios";

const ScanBinItems2 = forwardRef(({ currentStep, onStepChange }, ref) => {
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

  const [mismatchCounts, setMismatchCounts] = useState({}); // { componentId: count }
  const [manualQuantities, setManualQuantities] = useState({}); // { componentId: manualQty }

  const focusActiveInput = () => {
    if (currentStep === 0 && binInputRef.current) binInputRef.current.focus();
    else if (currentStep === 1 && componentInputRef.current) componentInputRef.current.focus();
    else if (currentStep === 2 && jtcInputRef.current) jtcInputRef.current.focus();
  };

  // Helper to check positive number
  const isPositiveNumber = (val) => {
    const num = Number(val);
    return !isNaN(num) && num > 0;
  };
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

  // Fetch expected quantity and component name from master list
  const fetchComponentMasterData = async (componentId) => {
    try {
      const res = await axios.get(`/api/component-master/${componentId}`);
      if (res.data.success) {
        return {
          expected_quantity_per_bin: res.data.expected_quantity_per_bin,
          component_name: res.data.component_name,
        };
      }
    } catch (err) {
      console.error(`Failed to fetch master data for component ${componentId}`, err);
    }
    return null;
  };



  const handleBinScan = async (bin) => {
    if (!bin.trim()) return;

    const normalized = bin.trim().toUpperCase();
    setBinId(normalized);
    setMessage("");

    try {
      const res = await axios.get(`/api/bin-info/${normalized}`);

      if (!res.data.success) {
        setMessage("❌ No components found for this bin.");
        setShowMessageModal(true);
        return;
      }

      const componentsFromApi = res.data.components || [];
      const binInfo = res.data.bin || {};

      if (componentsFromApi.length === 0) {
        setMessage("❌ No components found for this bin.");
        setShowMessageModal(true);
        return;
      }

      console.log("Bin Info:", binInfo);
      console.log("Components from API:", componentsFromApi);

      const componentIds = componentsFromApi.map(c => c.component_id);

      // Determine scan mode based on quantity_check_status
      const partialScanNeeded = ["Shortage", "Excess", "Pending"].includes(binInfo.quantity_check_status);
      const quantitiesOk = binInfo.quantity_check_status === "Ready";

      const newComponentData = {};
      componentsFromApi.forEach(c => {
        const hasSavedQty = quantitiesOk && c.actual_quantity != null;
        const isPartialScan = partialScanNeeded && c.actual_quantity != null;

        // FIXED: For non-scale components, use last saved actual quantity if available on partial scan
        const pcsValue = c.require_scale
          ? (hasSavedQty || isPartialScan ? c.actual_quantity : null)
          : (hasSavedQty || isPartialScan ? c.actual_quantity : c.expected_quantity_per_bin);

        // unit weight from DB or fallback
        const unitWeightGValue = c.unit_weight_g ?? (componentData[c.component_id]?.unit_weight_g || null);

        // net_kg: for no-scale, use DB value if exists, else calculate fallback
        let netKgValue = null;
        if (!c.require_scale) {
          if (hasSavedQty || isPartialScan) {
            netKgValue = c.actual_weight != null
              ? c.actual_weight
              : (pcsValue && unitWeightGValue)
                ? parseFloat(((pcsValue * unitWeightGValue) / 1000).toFixed(3))
                : 0;
          } else {
            netKgValue = (pcsValue && unitWeightGValue)
              ? parseFloat(((pcsValue * unitWeightGValue) / 1000).toFixed(3))
              : 0;
          }
        } else {
          netKgValue = hasSavedQty || isPartialScan ? c.actual_weight : null;
        }

        // Calculate difference and discrepancy_type for no-scale components
        let differenceValue = c.difference ?? null;
        let discrepancyTypeValue = (hasSavedQty || isPartialScan) ? (c.discrepancy_type || "OK") : null;

        if (!c.require_scale) {
          differenceValue = pcsValue - c.expected_quantity_per_bin;
          discrepancyTypeValue = differenceValue === 0 ? "OK" : (differenceValue < 0 ? "Shortage" : "Excess");
        }

        newComponentData[c.component_id] = {
          ...componentData[c.component_id],
          expected_quantity_per_bin: c.expected_quantity_per_bin,
          component_id: c.component_id,
          pcs: pcsValue,
          net_kg: netKgValue,
          unit_weight_g: unitWeightGValue,
          discrepancy_type: discrepancyTypeValue,
          difference: differenceValue,
          loading: false,
          error: null,
          needsScaleReading: c.require_scale && !(hasSavedQty || isPartialScan),
          require_scale: c.require_scale,
        };
      });

      console.log("New Component Data:", newComponentData);

      setScannedComponents(componentIds);
      setComponentData(newComponentData);

      // Skip directly to JTC binding step if bin is Pending JTC and quantities are OK
      if (binInfo.status === "Pending JTC" && binInfo.quantity_check_status === "Ready") {
        if (onStepChange) onStepChange(2);
        return;
      }

      // Otherwise proceed to component scan step
      if (onStepChange) onStepChange(1);
    } catch (err) {
      console.error("❌ Failed to fetch components for bin:", err);
      setMessage("❌ Error fetching bin components.");
      setShowMessageModal(true);
    }
  };

  // Handle scanning a new component manually
  const handleComponentScan = async (componentIdRaw) => {
    const componentId = componentIdRaw.trim().toUpperCase();
    if (!componentId) return;

    if (scannedComponents.includes(componentId)) {
      setMessage(`Component ${componentId} already scanned.`);
      setShowMessageModal(true);
      return;
    }

    setScannedComponents(prev => [...prev, componentId]);

    try {
      // Pass current binId to get last saved scale info for this bin-component
      const res = await axios.get(`/api/component-master/${componentId}`, {
        params: { binId }
      });

      if (res.data.success) {
        const masterData = res.data;
        console.log("Master Data with scale info:", masterData);

        const requireScale = masterData.require_scale ?? true;

        // Use last saved scale info if available
        const lastPcs = masterData.last_actual_quantity != null ? masterData.last_actual_quantity : (requireScale ? null : masterData.expected_quantity_per_bin);
        const lastUnitWeightG = masterData.last_unit_weight_g ?? masterData.unit_weight_g ?? null;

        // Calculate net_kg fallback if no last saved weight
        const lastNetKg = masterData.last_actual_weight != null
          ? masterData.last_actual_weight
          : (!requireScale && lastPcs && lastUnitWeightG)
            ? parseFloat(((lastPcs * lastUnitWeightG) / 1000).toFixed(3))
            : (requireScale ? null : 0);

        setComponentData(prev => ({
          ...prev,
          [componentId]: {
            expected_quantity_per_bin: masterData.expected_quantity_per_bin,
            component_id: masterData.component_id,
            unit_weight_g: lastUnitWeightG,
            pcs: lastPcs,
            net_kg: lastNetKg,
            loading: false,
            error: null,
            difference: 0,
            discrepancy_type: null,
            needsScaleReading: requireScale,
            require_scale: masterData.require_scale,
          }
        }));
      } else {
        // fallback if no master data
        setComponentData(prev => ({
          ...prev,
          [componentId]: {
            expected_quantity_per_bin: null,
            component_name: null,
            unit_weight_g: null,
            pcs: null,
            net_kg: null,
            loading: false,
            error: null,
            difference: null,
            discrepancy_type: null,
            needsScaleReading: true,
            require_scale: true,
          }
        }));
        setMessage(`Component ${componentId} not found in master data.`);
        setShowMessageModal(true);
      }
    } catch (error) {
      setComponentData(prev => ({
        ...prev,
        [componentId]: {
          expected_quantity_per_bin: null,
          component_name: null,
          unit_weight_g: null,
          pcs: null,
          net_kg: null,
          loading: false,
          error: null,
          difference: null,
          discrepancy_type: null,
          needsScaleReading: true,
          require_scale: true,
        }
      }));
      setMessage(`Error fetching data for component ${componentId}.`);
      setShowMessageModal(true);
    }

    if (onStepChange) onStepChange(1);
  };

  // Dummy scale data for testing
  const getDummyScaleData = (expectedQuantity) => {
    // Simulate success 80% of the time
    const isSuccess = Math.random() < 0.8;

    if (!isSuccess) {
      // Simulate failure
      return {
        success: false,
        net_kg: null,
        pcs: null,
        unit_weight_g: null,
        error: "Scale reading failed",
      };
    }

    // Simulate pcs around expectedQuantity ±5 (min 1)
    const pcs = Math.max(1, expectedQuantity + Math.floor((Math.random() * 11) - 5));

    // Simulate net_kg around 100 ±10
    const net_kg = parseFloat((100 + (Math.random() * 20 - 10)).toFixed(2));

    // Simulate unit_weight_g around net_kg * 1000 / pcs (approx)
    const unit_weight_g = parseFloat(((net_kg * 1000) / pcs).toFixed(2));

    return {
      success: true,
      net_kg,
      pcs,
      unit_weight_g,
      error: null,
    };
  };


  const adjustQuantity = (componentId, delta) => {
    setComponentData((prev) => {
      const currentQty = prev[componentId]?.pcs ?? 0;
      const newQty = Math.max(0, currentQty + delta);
      const expectedQty = prev[componentId]?.expected_quantity_per_bin ?? 0;
      const difference = newQty - expectedQty;
      const discrepancy_type = difference === 0 ? "OK" : difference < 0 ? "Shortage" : "Excess";

      return {
        ...prev,
        [componentId]: {
          ...prev[componentId],
          pcs: newQty,
          difference,
          discrepancy_type,
          error: null,
        },
      };
    });

    // Reset mismatch count if you use that feature
    setMismatchCounts((prev) => ({ ...prev, [componentId]: 0 }));
  };

  const manualQuantityChange = (componentId, value) => {
    const num = Number(value);
    if (isNaN(num) || num < 0) return; // ignore invalid input

    setComponentData((prev) => {
      const expectedQty = prev[componentId]?.expected_quantity_per_bin ?? 0;
      const difference = num - expectedQty;
      const discrepancy_type = difference === 0 ? "OK" : difference < 0 ? "Shortage" : "Excess";

      return {
        ...prev,
        [componentId]: {
          ...prev[componentId],
          pcs: num,
          difference,
          discrepancy_type,
          error: null,
        },
      };
    });

    setMismatchCounts((prev) => ({ ...prev, [componentId]: 0 }));
  };

const fetchScaleReading = async (componentId) => {
  setComponentData(prev => ({
    ...prev,
    [componentId]: {
      ...(prev[componentId] || {}),
      loading: true,
      error: null,
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

    const expectedQty = componentData[componentId]?.expected_quantity_per_bin || 50; // fallback 50

    // Calculate discrepancy
    const difference = validPcs !== null ? validPcs - expectedQty : null;
    const discrepancy_type = difference === 0 ? "OK" : (difference < 0 ? "Shortage" : "Excess");

    // Update mismatch count
    setMismatchCounts(prev => {
      const currentCount = prev[componentId] || 0;
      if (discrepancy_type === "OK") {
        return { ...prev, [componentId]: 0 };
      } else {
        return { ...prev, [componentId]: currentCount + 1 };
      }
    });

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
        error: (validNetKg && validPcs && validUnitWeight) ? null : "Invalid weight reading",
        difference,
        discrepancy_type,
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
        error: "Failed to get scale reading",
        difference: null,
        discrepancy_type: null,
      }
    }));
  }
};

  // Check if quantity matches expected quantity exactly
  const isQuantityCorrect = (componentId) => {
    const data = componentData[componentId];
    if (!data) return false;
    if (!isPositiveNumber(data.pcs)) return false;
    if (typeof data.expected_quantity_per_bin !== "number") return false;
    return data.pcs === data.expected_quantity_per_bin;
  };


  const allQuantitiesOk = () => {
    return scannedComponents.length > 0 && scannedComponents.every(compId => {
      return isQuantityCorrect(compId);
    });
  };

  const isQuantityValid = (componentId) => {
    const data = componentData[componentId];
    if (!data) return false;
    return (
      isPositiveNumber(data.pcs) &&
      isPositiveNumber(data.net_kg) &&
      isPositiveNumber(data.unit_weight_g)
    );
  };

  // Check if all components have valid scale readings and correct quantity
  const allComponentsHaveScaleReadings = () => {
    return scannedComponents.length > 0 && scannedComponents.every((compId) => {
      const data = componentData[compId];
      return data && !data.loading &&
        isPositiveNumber(data.net_kg) &&
        isPositiveNumber(data.pcs) &&
        isPositiveNumber(data.unit_weight_g) &&
        isQuantityCorrect(compId);
    });
  };
  const allComponentsHaveValidReadings = () => {
    return scannedComponents.length > 0 && scannedComponents.every((compId) => {
      return isQuantityValid(compId);
    });
  };


  const isComponentReady = (data) => {
    if (!data) return false;
    console.log("Checking component ready:", data, data.discrepancy_type);

    const isDiscrepancyAcceptable =
      data.discrepancy_type === "OK" ||
      data.discrepancy_type === "Shortage" ||
      data.discrepancy_type === "Excess";

    if (data.require_scale) {
      return (
        isPositiveNumber(data.net_kg) &&
        isPositiveNumber(data.pcs) &&
        isPositiveNumber(data.unit_weight_g) &&
        isDiscrepancyAcceptable
      );
    } else {
      return (
        isPositiveNumber(data.pcs) &&
        isPositiveNumber(data.unit_weight_g) &&
        isDiscrepancyAcceptable
      );
    }
  };

  // Replace your readyCount calculation with this:
  const readyCount = useMemo(() => {
    return scannedComponents.filter((compId) => {
      const data = componentData[compId];
      return isComponentReady(data);
    }).length;
  }, [scannedComponents, componentData]);

  // Handle JTC scan
  const handleJtcScan = async (jtc) => {
    const normalized = jtc.trim().replace(/^(\*j)/i, "").toUpperCase();
    if (!normalized) return;

    setLoading(true);
    try {
      const response = await axios.get(`/api/jtc-info/${normalized}`);
      const jtcData = response.data.jtc;
      setJtcId(normalized);
      setJtcInfo(jtcData);
      setMessage("");
    } catch (error) {
      setMessage("JTC not found for scanned barcode.");
      setShowMessageModal(true);
    } finally {
      setLoading(false);
    }
  };

  // Print label
  const handlePrintLabel = async () => {
    console.log("printing jtc info" + jtcInfo);
    try {
      const labelData = {
        coNumber: jtcInfo.jtc_CONumber,
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

      await fetch('/api/print-work-order-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(labelData)
      });
    } catch (err) {
      alert('Print failed!');
    }
  };

  // Handle Enter key for inputs
  const handleKeyDown = (e, type) => {
    if (e.key === "Enter") {
      e.preventDefault();

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

  // Clear a scanned component
  const clearComponent = (idx) => {
    const removedComponent = scannedComponents[idx];

    const newComponents = scannedComponents.filter((_, i) => i !== idx);
    setScannedComponents(newComponents);

    const newComponentData = { ...componentData };
    delete newComponentData[removedComponent];
    setComponentData(newComponentData);
  };

  // Proceed to review step
  const handleNextToReview = () => {
    if (!allComponentsHaveValidReadings()) {
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

    if (!allComponentsHaveValidReadings()) {
      setMessage("Please get valid scale readings for all components before saving.");
      setShowMessageModal(true);
      return;
    }

    if (jtcId && !allQuantitiesOk()) {
      setMessage("Cannot assign JTC: quantity check not OK for all components.");
      setShowMessageModal(true);
      return;
    }

    // Build all arrays consistently with .map()
    const quantities = scannedComponents.map(compId => {
      const comp = componentData[compId] || {};
      return typeof comp.pcs === "number" ? comp.pcs : 0;
    });

    const expectedWeights = scannedComponents.map(compId => {
      const comp = componentData[compId] || {};
      return (typeof comp.expected_quantity_per_bin === "number" && typeof comp.unit_weight_g === "number")
        ? (comp.expected_quantity_per_bin * comp.unit_weight_g) / 1000
        : 0;
    });

    const actualWeights = scannedComponents.map(compId => {
      const comp = componentData[compId] || {};
      if (comp.net_kg && comp.net_kg > 0) return comp.net_kg;
      // fallback: send last known weight or 0 if none
      return comp.net_kg_last_known || 0;
    });

    const unitWeights = scannedComponents.map(compId => {
      const comp = componentData[compId] || {};
      return typeof comp.unit_weight_g === "number" ? comp.unit_weight_g : 0;
    });

    setLoading(true);
    setMessage("Saving bin information...");
    setShowMessageModal(true);

    try {
      const payload = {
        binId,
        jtc: jtcInfo?.jtc_id || null,
        components: scannedComponents,
        quantities,
        expectedWeights,
        actualWeights,
        unitWeights,
      };

      console.log("Payload:", payload);

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


  const resetAfterSuccess = () => {
    setBinId("");
    setScannedComponents([]);
    setComponentData({});
    setJtcId("");
    setJtcInfo(null);
    setMessage("");
    setShowMessageModal(false);
    if (onStepChange) onStepChange(0);
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
    setShowMessageModal(false);

    if (message.startsWith("Successfully")) {
      resetAfterSuccess();
    }

    setMessage("");
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

  console.log("Ready count:", readyCount);
  console.log("Component data:", componentData);

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
        {binId && currentStep === 1 && (
          <div className="max-w-7xl mx-auto mb-">
            <div className="flex flex-col lg:flex-row gap-6 items-center">

              {/* Current Bin Display */}
              <div className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg border-l-8 border-blue-700 min-h-[120px] flex items-center">
                <div className="flex items-center justify-between w-full">
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
                  disabled={!allComponentsHaveValidReadings()}
                  className={`w-full px-6 py-4 text-base rounded-lg font-semibold transition-transform duration-200 ease-in-out
    ${allComponentsHaveValidReadings()
                      ? "bg-green-600 text-white shadow-lg hover:bg-green-700 hover:scale-105"
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    }`}
                  aria-disabled={!allComponentsHaveValidReadings()}
                  aria-label={allComponentsHaveValidReadings() ? "Review and confirm components" : "Complete scale readings first"}
                >
                  {allComponentsHaveValidReadings()
                    ? "📋 Review & Confirm →"
                    : "⚠️ Complete Scale Readings First"}
                </button>
              </div>
            </div>

            {/* Scanned Components Display - For Step 1 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
              <h3 className="font-semibold text-blue-800 mb-6 text-xl">
                🔧 Scanned Components ({scannedComponents.length})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {scannedComponents.map((component, idx) => {
                  const data = componentData[component] || {};

                  // Calculate discrepancy quantity safely
                  const discrepancyQty =
                    typeof data.pcs === "number" && typeof data.expected_quantity_per_bin === "number"
                      ? data.pcs - data.expected_quantity_per_bin
                      : null;

                  // Use discrepancy_type directly for correctness
                  const quantityCorrect = data.discrepancy_type === "OK";

                  // Badge text and class based on discrepancy_type
                  const badgeText = (() => {
                    switch (data.discrepancy_type) {
                      case "OK":
                        return "✅ OK";
                      case "Shortage":
                        return `⚠️ Shortage (${Math.abs(discrepancyQty)} pcs)`;
                      case "Excess":
                        return `⚠️ Excess (+${discrepancyQty} pcs)`;
                      default:
                        return "N/A";
                    }
                  })();

                  const badgeClass = (() => {
                    switch (data.discrepancy_type) {
                      case "OK":
                        return "bg-green-100 text-green-700";
                      case "Shortage":
                        return "bg-red-100 text-red-700";
                      case "Excess":
                        return "bg-yellow-100 text-yellow-700";
                      default:
                        return "bg-gray-100 text-gray-700";
                    }
                  })();

                  // Reset scale reading handler
                  const resetScaleReading = (componentId) => {
                    setComponentData((prev) => ({
                      ...prev,
                      [componentId]: {
                        ...(prev[componentId] || {}),
                        net_kg: null,
                        pcs: null,
                        unit_weight_g: null,
                        error: null,
                        loading: false,
                        discrepancy_type: null,
                        difference: null,
                      },
                    }));
                  };

                  // Quantity adjustment handlers
                  const adjustQuantity = (componentId, delta) => {
                    setComponentData((prev) => {
                      const currentQty = prev[componentId]?.pcs ?? 0;
                      const newQty = Math.max(0, currentQty + delta);
                      const expectedQty = prev[componentId]?.expected_quantity_per_bin ?? 0;
                      const difference = newQty - expectedQty;
                      const discrepancy_type = difference === 0 ? "OK" : difference < 0 ? "Shortage" : "Excess";

                      return {
                        ...prev,
                        [componentId]: {
                          ...prev[componentId],
                          pcs: newQty,
                          difference,
                          discrepancy_type,
                          error: null,
                        },
                      };
                    });

                    setMismatchCounts((prev) => ({ ...prev, [componentId]: 0 }));
                  };

                  const manualQuantityChange = (componentId, value) => {
                    const num = Number(value);
                    if (isNaN(num) || num < 0) return; // ignore invalid input

                    setComponentData((prev) => {
                      const expectedQty = prev[componentId]?.expected_quantity_per_bin ?? 0;
                      const difference = num - expectedQty;
                      const discrepancy_type = difference === 0 ? "OK" : difference < 0 ? "Shortage" : "Excess";

                      return {
                        ...prev,
                        [componentId]: {
                          ...prev[componentId],
                          pcs: num,
                          difference,
                          discrepancy_type,
                          error: null,
                        },
                      };
                    });

                    setMismatchCounts((prev) => ({ ...prev, [componentId]: 0 }));
                  };

                  // Determine button status for scale reading
                  const isReadingSuccess = data.discrepancy_type === "OK";
                  const isMismatch = data.discrepancy_type === "Shortage" || data.discrepancy_type === "Excess";
                  const isReadingFailed = !!data.error;
                  const isLoading = data.loading;

                  // For button disabled state: disable if loading OR reading success OR mismatch with reading success (yellow)
                  const isButtonDisabled = isLoading || isReadingSuccess || isMismatch;

                  // Button text and class based on status
                  let buttonText = "📊 Get Scale Reading";
                  let buttonClass = "bg-blue-600 text-white hover:bg-blue-700";

                  if (isLoading) {
                    buttonText = "Reading...";
                    buttonClass = "bg-gray-300 text-gray-500 cursor-not-allowed";
                  } else if (data.require_scale === false && !data.loading && !data.error && data.discrepancy_type === "OK") {
                    // Initial no-scale required state
                    buttonText = "✅ Reading Success - No Scale Required";
                    buttonClass = "bg-green-600 text-white cursor-default";
                  } else if (isReadingSuccess) {
                    buttonText = "✅ Reading Success";
                    buttonClass = "bg-green-600 text-white cursor-default";
                  } else if (isMismatch) {
                    buttonText = "⚠️ Reading Success - Qty Mismatch";
                    buttonClass = "bg-yellow-500 text-white cursor-default";
                  } else if (isReadingFailed) {
                    buttonText = "❌ Reading Failed - Retry";
                    buttonClass = "bg-red-600 text-white hover:bg-red-700";
                  }

                  return (
                    <div
                      key={idx}
                      className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center basis-1/3 min-w-[128px]">
                          {/* Component ID above image */}
                          <span className="font-mono text-gray-700 font-semibold text-sm mb-2 truncate text-center">
                            {idx + 1}. {data?.component_id || component}
                          </span>
                          <div className="w-32 h-32 bg-gray-100 rounded border overflow-hidden cursor-pointer hover:shadow-lg transition-shadow flex items-center justify-center">
                            <img
                              src={`src/assets/components/${component}.jpg`}
                              alt={component}
                              className="w-full h-full object-contain"
                              onClick={() => openImageModal(`src/assets/components/${component}.jpg`)}
                              onError={(e) => {
                                if (e.target.src.endsWith(".jpg")) {
                                  e.target.src = `src/assets/components/${component}.png`;
                                } else if (e.target.src.endsWith(".png")) {
                                  e.target.src = `src/assets/components/${component}.jpeg`;
                                } else {
                                  e.target.src = "https://placehold.co/128x128?text=No+Img";
                                }
                              }}
                            />
                          </div>
                        </div>

                        {/* Component Info */}
                        <div className="flex-1 basis-2/3 min-w-0">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-mono text-gray-700 font-semibold text-sm truncate">
                              {/* Moved component ID above, so no duplicate here */}
                            </span>
                            <div className="flex items-center gap-2">
                              <span
                                className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded ${badgeClass}`}
                              >
                                {badgeText}
                              </span>
                              <button
                                onClick={() => clearComponent(idx)}
                                className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50 transition-colors border border-red-200 flex-shrink-0"
                              >
                                Clear
                              </button>
                              {/* Reset button only here */}
                              <button
                                onClick={() => resetScaleReading(component)}
                                className="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 rounded hover:bg-blue-50 transition-colors border border-blue-200 flex-shrink-0"
                                title="Reset scale reading / quantity"
                              >
                                Reset
                              </button>
                            </div>
                          </div>

                          {/* Weight Information */}
                          <div
                            className={`border rounded p-3 ${quantityCorrect ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"
                              }`}
                          >
                            <h5
                              className={`text-xs font-semibold mb-2 ${quantityCorrect ? "text-green-700" : "text-orange-700"
                                }`}
                            >
                              {quantityCorrect ? "✅ Weight & Quantity Confirmed:" : "⚠️ Weight or Quantity Mismatch:"}
                            </h5>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600 font-medium">Unit Weight:</span>
                                <span className="font-semibold">{data.unit_weight_g != null ? `${data.unit_weight_g}g` : "N/A"}</span>
                              </div>

                              {/* Quantity with conditional +/- buttons or plain text */}
                              <div className="flex justify-between items-center">
                                <span className="text-gray-600 font-medium">Quantity:</span>
                                {(!quantityCorrect && !data.require_scale) ||
                                  (data.require_scale && (data.discrepancy_type === "Shortage" || data.discrepancy_type === "Excess")) ? (
                                  <div className="flex items-center space-x-2 max-w-xs">
                                    <button
                                      type="button"
                                      onClick={() => adjustQuantity(component, -1)}
                                      disabled={(data.pcs ?? 0) <= 0}
                                      className="px-2 py-1 bg-gray-300 rounded disabled:opacity-50"
                                      title="Decrease quantity"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      min="0"
                                      value={data.pcs ?? ""}
                                      onChange={(e) => manualQuantityChange(component, e.target.value)}
                                      className="w-16 text-center border rounded"
                                      aria-label={`Quantity for component ${component}`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => adjustQuantity(component, 1)}
                                      className="px-2 py-1 bg-gray-300 rounded"
                                      title="Increase quantity"
                                    >
                                      +
                                    </button>
                                  </div>
                                ) : (
                                  <span className="font-semibold">{data.pcs != null ? `${data.pcs} pcs` : "N/A"}</span>
                                )}
                              </div>

                              <div className="flex justify-between">
                                <span className="text-gray-600 font-medium">Expected Quantity:</span>
                                <span className="font-semibold">
                                  {data.expected_quantity_per_bin != null ? `${data.expected_quantity_per_bin} pcs` : "N/A"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600 font-medium">Total Weight:</span>
                                <span className="font-semibold">{data.net_kg != null ? `${data.net_kg}kg` : "N/A"}</span>
                              </div>
                            </div>
                          </div>

                          {/* Scale Reading / No Scale Required Button */}
                          <div className="mt-3">
                            <button
                              onClick={() => fetchScaleReading(component)}
                              disabled={isButtonDisabled}
                              className={`w-full px-3 py-2 rounded transition-colors text-xs ${buttonClass}`}
                              title={buttonText}
                            >
                              {buttonText}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-center mt-8">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 max-w-2xl mx-auto">
                  <p className="text-sm text-yellow-800">
                    ⚠️ Please ensure all components have scale readings and correct quantities before proceeding to review.
                  </p>
                  <p className="text-xs text-yellow-600 mt-1">
                    Components ready: {readyCount} / {scannedComponents.length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}





        {/* Step 3: Review & Confirm (with optional JTC) */}
        {currentStep === 2 && (
          <div className="max-w-7xl mx-auto space-y-6">
            {/* JTC Input at Top */}
            <div className="flex items-center gap-4 max-w-2xl mx-auto">
              <label className="text-lg font-semibold text-gray-700 whitespace-nowrap">
                🏷️ Scan JTC (Optional):
              </label>
              <input
                ref={jtcInputRef}
                type="text"
                className={`border-2 rounded-lg px-4 py-3 flex-1 text-lg focus:outline-none focus:ring-2 ${allQuantitiesOk()
                  ? "border-purple-300 focus:ring-purple-500 focus:border-purple-500"
                  : "border-gray-300 bg-gray-100 cursor-not-allowed"
                  }`}
                onKeyDown={(e) => {
                  if (!allQuantitiesOk()) {
                    e.preventDefault();
                    setMessage("Cannot assign JTC: quantity check not OK for all components.");
                    setShowMessageModal(true);
                    return;
                  }
                  handleKeyDown(e, "jtc");
                }}
                placeholder="📱 Scan JTC work order (Optional)"
                disabled={loading || !allQuantitiesOk()}
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

                  {/* Quantity check warning */}
                  {!allQuantitiesOk() && (
                    <p className="mt-2 text-sm font-semibold text-white-200 bg-yellow-600 rounded px-3 py-1">
                      ⚠️ Quantity check not OK for all components. Cannot bind JTC until resolved.
                    </p>
                  )}
                </div>

                {/* Confirm & Save Button */}
                <div className="w-full lg:w-1/3 flex flex-col justify-center">
                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm text-center">
                    <span className="font-semibold">
                      {readyCount} / {scannedComponents.length} components ready
                    </span>
                    <button
                      onClick={handleConfirmSave}
                      disabled={loading || !allComponentsHaveValidReadings()}
                      className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors text-sm ${loading || !allComponentsHaveValidReadings()
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-green-600 text-white hover:bg-green-700"
                        }`}
                    >
                      {loading
                        ? "Saving..."
                        : allComponentsHaveValidReadings()
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
                <div className="flex items-center justify-between min-h-[96px]">
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

                  <div className="text-right flex flex-col justify-center">
                    <p className="text-sm text-blue-100">Components Scanned</p>
                    <p className="text-3xl font-bold">{scannedComponents.length}</p>
                  </div>
                </div>
              </div>
            )}






            {/* Scanned Components Display - Review Mode */}
            {scannedComponents.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="font-semibold text-blue-800 mb-6 text-xl">
                  🔧 Scanned Components ({scannedComponents.length}) - Ready for Save
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {scannedComponents.map((component, idx) => {
                    const data = componentData[component] || {}; // safe fallback
                    const scaleReady = data && !data.loading &&
                      isPositiveNumber(data.net_kg) &&
                      isPositiveNumber(data.pcs) &&
                      isPositiveNumber(data.unit_weight_g);

                    // Determine if partial scan (based on needsScaleReading flag or your own logic)
                    const isPartialScan = data?.needsScaleReading === false && data?.discrepancy_type != null;

                    // Calculate discrepancy live only if NOT partial scan and scale reading ready
                    const liveDifference = scaleReady && !isPartialScan
                      ? data.pcs - data.expected_quantity_per_bin
                      : null;

                    // Determine discrepancy type to display
                    const discrepancyType = (() => {
                      if (!data) return null;

                      if (isPartialScan) {
                        // Use stored discrepancy_type from backend for partial scan
                        return data.discrepancy_type || null;
                      }

                      if (scaleReady) {
                        if (liveDifference === 0) return "OK";
                        if (liveDifference < 0) return "Shortage";
                        if (liveDifference > 0) return "Excess";
                      }

                      return null;
                    })();

                    // Discrepancy quantity to display
                    const discrepancyQty = (() => {
                      if (!data) return null;

                      if (isPartialScan) {
                        return data.difference; // from backend last scan
                      }

                      if (scaleReady) {
                        return liveDifference;
                      }

                      return null;
                    })();

                    // Badge color classes
                    const badgeClasses = discrepancyType === "OK" ? "bg-green-100 text-green-700"
                      : discrepancyType === "Shortage" ? "bg-red-100 text-red-700"
                        : discrepancyType === "Excess" ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-700";

                    // Badge text with discrepancy quantity
                    const badgeText = discrepancyType === "OK" ? "✅ OK"
                      : discrepancyType === "Shortage" ? `⚠️ Shortage (${Math.abs(discrepancyQty)})`
                        : discrepancyType === "Excess" ? `⚠️ Excess (+${discrepancyQty})`
                          : "N/A";

                    return (
                      <div key={idx} className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-4">
                          {/* Component Image */}
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

                          {/* Component Info */}
                          <div className="flex-1 basis-2/3 min-w-0">
                            <div className="flex items-center justify-between mb-3">
                              <span className="font-mono text-gray-700 font-semibold text-sm truncate">
                                {idx + 1}. {data?.component_id || component}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded ${badgeClasses}`}>
                                  {badgeText}
                                </span>

                              </div>
                            </div>

                            {/* Weight Information */}
                            <div className={`border rounded p-3 ${scaleReady && discrepancyType === "OK" ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                              <h5 className={`text-xs font-semibold mb-2 ${scaleReady && discrepancyType === "OK" ? 'text-green-700' : 'text-red-700'}`}>
                                {scaleReady && discrepancyType === "OK"
                                  ? '✅ Weight & Quantity Confirmed:'
                                  : '⚠️ Weight or Quantity Missing/Incorrect:'}
                              </h5>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-medium">Expected Quantity:</span>
                                  <span className="font-semibold">
                                    {data?.expected_quantity_per_bin != null
                                      ? `${data.expected_quantity_per_bin} pcs`
                                      : "N/A"
                                    }
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-medium">Quantity (Scanned):</span>
                                  <span className="font-semibold">
                                    {data?.pcs != null
                                      ? `${data.pcs} pcs`
                                      : "N/A"
                                    }
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-medium">Unit Weight:</span>
                                  <span className="font-semibold">
                                    {data?.unit_weight_g != null
                                      ? `${data.unit_weight_g}g`
                                      : "N/A"
                                    }
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-medium">Total Weight:</span>
                                  <span className="font-semibold">
                                    {data?.net_kg != null
                                      ? `${data.net_kg}kg`
                                      : "N/A"
                                    }
                                  </span>
                                </div>
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
                      ⚠️ Please ensure all components have scale readings and correct quantities before proceed.
                    </p>
                    <p className="text-xs text-yellow-600 mt-1">
                      Components Scanned: {readyCount} / {scannedComponents.length}
                    </p>
                  </div>
                </div>
              </div>
            )}
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

export default ScanBinItems2;