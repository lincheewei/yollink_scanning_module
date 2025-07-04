import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import axios from "axios";

const AssignBinsToJTC = forwardRef(({ currentStep, onStepChange }, ref) => {
  const [step, setStep] = useState(currentStep || 0);
  const [jtcId, setJtcId] = useState("");
  const [jtcInfo, setJtcInfo] = useState(null);
  const [scannedBins, setScannedBins] = useState([]);
  const [binComponents, setBinComponents] = useState({});
  const [loadingComponents, setLoadingComponents] = useState({});
  const [message, setMessage] = useState("");
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState("");
  const [binToRemove, setBinToRemove] = useState(null);
  const [showRemoveConfirmModal, setShowRemoveConfirmModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [binToConfirmAdd, setBinToConfirmAdd] = useState(null);
  const [assignedJtcForBin, setAssignedJtcForBin] = useState(null);
  const [printData, setPrintData] = useState(null);

  const jtcInputRef = useRef(null);
  const binInputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    resetComponent: () => {
      setStep(0);
      setJtcId("");
      setJtcInfo(null);
      setScannedBins([]);
      setBinComponents({});
      setLoadingComponents({});
      setMessage("");
      setShowMessageModal(false);
      setShowImageModal(false);
      setSelectedImage("");
      setBinToRemove(null);
      setShowRemoveConfirmModal(false);
      setLoading(false);
      setBinToConfirmAdd(null);
      if (onStepChange) onStepChange(0);
    },
  }));

  useEffect(() => {
    if (typeof currentStep === "number" && currentStep !== step) {
      setStep(currentStep);
    }
  }, [currentStep]);

  useEffect(() => {
    if (step === 0) {
      jtcInputRef.current?.focus();
    } else if (step === 1) {
      binInputRef.current?.focus();
    }
  }, [step, scannedBins.length]);

  // --- FETCH BIN COMPONENTS ---
  const fetchBinComponents = async (binId) => {
    setLoadingComponents((prev) => ({ ...prev, [binId]: true }));
    try {
      const response = await axios.get(`/api/bin-info/${binId}`);
      const binData = response.data.bin;

      if (binData.status === "Pending JTC") {
        // OK to add
      } else if (binData.status === "Ready for Release") {
        setAssignedJtcForBin(binData.jtc);   // <-- Save assigned JTC ID!

        setBinToConfirmAdd(binId);

        return false;
      } else {
        setMessage(
          `Bin ${binId} is not ready for assignment (current status: "${binData.status}"). Please scan this bin in the "Scan Bin Items" tab first.`
        );
        setShowMessageModal(true);
        return false;
      }

      const components = [
        { id: binData.component_1, quantity: binData.quantity_c1 },
        { id: binData.component_2, quantity: binData.quantity_c2 },
        { id: binData.component_3, quantity: binData.quantity_c3 },
        { id: binData.component_4, quantity: binData.quantity_c4 },
      ].filter((c) => c.id);

      setBinComponents((prev) => ({
        ...prev,
        [binId]: {
          components,
          remark: binData.remark ? binData.remark.trim() : null,
        },
      }));
      return true;
    } catch (error) {
      setMessage(`Error fetching bin info for ${binId}.`);
      setShowMessageModal(true);
      setBinComponents((prev) => ({
        ...prev,
        [binId]: { components: [], remark: null },
      }));
      return false;
    } finally {
      setLoadingComponents((prev) => ({ ...prev, [binId]: false }));
    }
  };

  const handleJtcScan = async (barcode) => {
    if (!barcode.trim()) return;

    // ✅ Step 1: Remove *j prefix and normalize
    const normalizedJtcId = barcode.trim().replace(/^(\*j)/i, "").toUpperCase();

    setLoading(true);
    try {
      const response = await axios.get(`/api/jtc-info/${normalizedJtcId}`);
      const jtc = response.data.jtc;

      setJtcInfo(jtc);
      setJtcId(normalizedJtcId);
      setMessage("");
      setStep(1);
      if (onStepChange) onStepChange(1);
    } catch (error) {
      setMessage("JTC not found for scanned barcode.");
      setShowMessageModal(true);
    } finally {
      setLoading(false);
    }
  };

  // --- HANDLE BIN SCAN ---
  const handleBinScan = async (binId) => {
    const normalizedBinId = binId.trim().toUpperCase();
    if (!normalizedBinId) return;

    // Check for duplicate (case-insensitive)
    if (scannedBins.includes(normalizedBinId)) {
      setMessage(`Bin ${normalizedBinId} is already assigned to this JTC.`);
      setShowMessageModal(true);
      return;
    }

    setMessage("");
    const ok = await fetchBinComponents(normalizedBinId);
    if (ok) {
      setScannedBins((prev) => [...prev, normalizedBinId]);
    }
  };

  // --- MODAL BIN ADD ---
  const confirmAddBin = async () => {
    if (!binToConfirmAdd) return;
    setScannedBins((prev) => [...prev, binToConfirmAdd]);
    setBinToConfirmAdd(null);
    setShowMessageModal(false);
  };
  const cancelAddBin = () => {
    setBinToConfirmAdd(null);
    setShowMessageModal(false);
  };

  // --- MODAL BIN REMOVE ---
  const confirmRemoveBin = (bin) => {
    setBinToRemove(bin);
    setShowRemoveConfirmModal(true);
  };
  const removeBin = () => {
    if (binToRemove) {
      setScannedBins((prev) => prev.filter((bin) => bin !== binToRemove));
      setBinComponents((prev) => {
        const newComponents = { ...prev };
        delete newComponents[binToRemove];
        return newComponents;
      });
      setLoadingComponents((prev) => {
        const newLoading = { ...prev };
        delete newLoading[binToRemove];
        return newLoading;
      });
      setMessage(`Bin ${binToRemove} removed from assignment`);
      setShowMessageModal(true);
      setBinToRemove(null);
      setShowRemoveConfirmModal(false);
    }
  };
  const cancelRemove = () => {
    setBinToRemove(null);
    setShowRemoveConfirmModal(false);
  };

  // --- CONFIRM ASSIGNMENT & PRINT ---
  const handleConfirmAssignment = async () => {
    if (!jtcInfo || scannedBins.length === 0) {
      setMessage("Please scan JTC and at least one bin before confirming.");
      setShowMessageModal(true);
      return;
    }
    setLoading(true);
    setMessage("Saving assignment...");
    setShowMessageModal(true);

    try {
      const response = await axios.post("/api/assign-bins", {
        jtc: jtcInfo.jtc_id,
        bins: scannedBins,
      });

      if (response.data.success) {
        setMessage(`Successfully assigned ${scannedBins.length} bin(s) to JTC ${jtcInfo.jtc_orderNumber}. Printing label(s)...`);
        setShowMessageModal(true);

        // Prepare data to send to print label (use correct field names from your backend)

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

        setPrintData(labelData);

        console.log("Printing labels... bodyData:", labelData);
        // Print labels for each bin
        for (let i = 0; i < scannedBins.length; i++) {
          await fetch('/api/print-work-order-label', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(labelData)
          });
        }
      } else {
        setMessage(response.data.error || "Error assigning bins.");
        setShowMessageModal(true);
      }
    } catch (error) {
      setMessage(error.response?.data?.error || "Network or server error.");
      setShowMessageModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handlePrintLabel = async () => {
    try {

      console.log("Printing labels... printdata:", printData);

      await fetch('/api/print-work-order-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          printData
        )
      });
      // Optional: Give feedback to the user (toast/snackbar/message)
    } catch (err) {
      alert('Print failed!');
    }
  };

  const closeMessageModal = () => {
    setShowMessageModal(false);
    setMessage("");
    // After closing modal, reset for next JTC
    setStep(0);
    setJtcId("");
    setJtcInfo(null);
    setScannedBins([]);
    setBinComponents({});
    setLoadingComponents({});
    setBinToRemove(null);
    setShowRemoveConfirmModal(false);
    setBinToConfirmAdd(null);
    if (onStepChange) onStepChange(0);

  };

  // --- KEYDOWN ---
  const handleKeyDown = (e, type) => {
    e.preventDefault(); // ⛔ 阻止默认行为（避免触发表单提交或按钮点击）

    if (e.key === "Enter") {
      if (type === "jtc") {
        handleJtcScan(e.target.value);
        e.target.value = "";
      } else if (type === "bin") {
        handleBinScan(e.target.value);
        e.target.value = "";
      }
    }
  };

  // --- BIN COMPONENTS DISPLAY (UNCHANGED, just for info display, no preview) ---
  const BinComponentsDisplay = ({ binId }) => {
    const binInfo = binComponents[binId] || {};
    const components = binInfo.components || [];
    const isLoading = loadingComponents[binId];

    if (isLoading) {
      return (
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            <span className="text-sm text-blue-600">Loading components...</span>
          </div>
        </div>
      );
    }

    if (components.length === 0) {
      return (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <span className="text-sm text-yellow-700">No components found for this bin</span>
        </div>
      );
    }

    return (
      <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded">
        <h5 className="text-xs font-semibold text-gray-600 mb-3">
          Components ({components.length}):
        </h5>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {components.map((component, idx) => (
            <div key={idx} className="bg-white p-3 rounded border text-center shadow-sm">
              <div className="w-20 h-20 mx-auto mb-2 bg-gray-100 rounded border overflow-hidden cursor-pointer hover:shadow-lg transition-shadow">
                <img
                  src={`src/assets/components/${component.id}.jpg`}
                  alt={component.id}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    if (e.target.src.endsWith(".jpg")) {
                      e.target.src = `src/assets/components/${component.id}.png`;
                    } else if (e.target.src.endsWith(".png")) {
                      e.target.src = `src/assets/components/${component.id}.jpeg`;
                    } else {
                      e.target.src = "https://placehold.co/80x80?text=No+Img";
                    }
                  }}
                />
              </div>
              <div className="text-xs text-gray-700 truncate font-medium mb-1" title={component.id}>
                {component.id}
              </div>
              <div className="text-sm font-semibold text-blue-600">
                Qty: {component.quantity ?? "N/A"}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // --- UI ---
  return (
    <div>
      <div className="space-y-6">
        {step === 0 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-4">
              <label className="text-lg font-semibold text-gray-700 whitespace-nowrap">
                🏷️ Scan JTC:
              </label>
              <input
                ref={jtcInputRef}
                type="text"
                className="border-2 border-purple-300 rounded-lg px-4 py-3 flex-1 text-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                onKeyDown={(e) => handleKeyDown(e, "jtc")}
                placeholder="📱 Scan JTC barcode and press Enter"
                disabled={loading}
                autoFocus
              />
            </div>
          </div>
        )}
        {step === 1 && (
          <div>
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center gap-4 mb-6">
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

            <div className="max-w-5xl mx-auto flex items-center justify-between gap-6">
              {/* JTC Info Card */}
              <div className="flex-1">
                <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg border-l-8 border-purple-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="bg-white bg-opacity-20 p-3 rounded-full">
                        <span className="text-2xl">🏷️</span>
                      </div>
                      <div>
                        <h2 className="text-sm font-medium text-purple-100 uppercase tracking-wide">
                          JTC Work Order
                        </h2>
                        <p className="text-2xl font-bold font-mono">
                          {jtcInfo?.jtc_orderNumber || jtcId}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-purple-100">Bins Assigned</p>
                      <p className="text-3xl font-bold">{scannedBins.length}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Button on the right (centered vertically) */}
              <div className="flex-shrink-0 flex items-center">
                <button
                  onClick={handleConfirmAssignment}
                  disabled={loading}
                  className={`px-8 py-4 rounded-xl font-bold text-base transition-colors whitespace-nowrap shadow-md ${loading
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-700"
                    }`}
                >
                  {loading ? "Saving..." : "✅ Confirm & Print"}
                </button>
              </div>
            </div>

            {scannedBins.length > 0 && (
              <div className="max-w-7xl mx-auto mt-8">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="font-semibold text-blue-800 mb-6 text-xl">
                    📦 Assigned Bins ({scannedBins.length})
                  </h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {scannedBins.map((bin, idx) => (
                      <div
                        key={idx}
                        className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-gray-700 font-semibold text-sm">
                              {idx + 1}. {bin}
                            </span>
                            {binComponents[bin]?.remark && (
                              <span className="text-xs italic text-purple-600 bg-purple-50 px-2 py-1 rounded">
                                📝 {binComponents[bin].remark}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => confirmRemoveBin(bin)}
                            disabled={loading}
                            className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50 transition-colors border border-red-200 flex-shrink-0 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                        <BinComponentsDisplay binId={bin} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
          </div>
        )}
      </div>

      {/* Bin Already Assigned Modal */}
      {binToConfirmAdd && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={cancelAddBin}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-4">Bin Already Assigned</h2>
            <p className="mb-6 text-gray-700">
              Bin <span className="font-mono">{binToConfirmAdd}</span> is already assigned
              {assignedJtcForBin ? (
                <> with JTC <span className="font-mono">{assignedJtcForBin}</span>.</>
              ) : (
                " to another JTC."
              )} Reassign?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelAddBin}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddBin}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Yes, Add Bin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message Modal (Success/Error) */}
      {showMessageModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 overflow-auto"
          onClick={closeMessageModal}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-auto shadow-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ minWidth: "320px" }}
          >
            <p className="text-center text-gray-900 text-lg font-semibold mb-4 leading-relaxed select-text">
              {message}
            </p>
            <div className="flex justify-center gap-4">
              {jtcInfo && (
                <button
                  onClick={handlePrintLabel}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg shadow-md hover:bg-green-700 transition-colors font-semibold"
                >
                  🖨️ Print
                </button>
              )}
              <button
                onClick={closeMessageModal}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors font-semibold"
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

      {/* Remove Confirm Modal */}
      {showRemoveConfirmModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={cancelRemove}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-4">Confirm Removal</h2>
            <p className="mb-6 text-gray-700">
              Are you sure you want to remove bin <span className="font-mono">{binToRemove}</span> from this assignment?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelRemove}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={removeBin}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default AssignBinsToJTC;