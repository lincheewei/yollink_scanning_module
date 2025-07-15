
import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import axios from "axios";

const ScanToWarehouseReturn = forwardRef(({ onStepChange }, ref) => {
  const [scannedBins, setScannedBins] = useState([]);
  const [currentBinId, setCurrentBinId] = useState("");
  const [binComponents, setBinComponents] = useState({});
  const [loadingComponents, setLoadingComponents] = useState({});
  const [message, setMessage] = useState("");
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState("");
  const [binToRemove, setBinToRemove] = useState(null);
  const [showRemoveConfirmModal, setShowRemoveConfirmModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const binInputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    resetComponent: () => {
      setScannedBins([]);
      setCurrentBinId("");
      setBinComponents({});
      setLoadingComponents({});
      setMessage("");
      setShowMessageModal(false);
      setShowImageModal(false);
      setSelectedImage("");
      setBinToRemove(null);
      setShowRemoveConfirmModal(false);
      setLoading(false);
      if (onStepChange) onStepChange(0);
    },
  }));

  useEffect(() => {
    binInputRef.current?.focus();
  }, [scannedBins.length]);

  // Fetch bin info for scanned bin
  const fetchBinComponents = async (binId) => {
    setLoadingComponents((prev) => ({ ...prev, [binId]: true }));
    try {
      const response = await axios.get(`/api/bin-info/${binId}`);
      const binData = response.data.bin;

      if (!binData) {
        setMessage(`Bin ${binId} not found.`);
        setShowMessageModal(true);
        return false;
      }

      // You may want to check if bin is eligible for warehouse return here
      // For example, only bins with status "Ready for Release" or "Released" can be returned

      // Map components from bin info
      const components = (response.data.components || []).map((c) => ({
        id: c.component_id,
        quantity: c.actual_quantity,
      }));

      setBinComponents((prev) => ({
        ...prev,
        [binId]: {
          components,
          remark: binData.remark ? binData.remark.trim() : null,
          jtc: binData.jtc || null,
          location: binData.location || "Production", // or wherever it currently is
          status: binData.status,
        },
      }));

      return true;
    } catch (error) {
      setMessage(`Error fetching bin info for ${binId}.`);
      setShowMessageModal(true);
      return false;
    } finally {
      setLoadingComponents((prev) => ({ ...prev, [binId]: false }));
    }
  };

  const handleBinScan = async (binId) => {
    const normalized = binId.trim().toUpperCase();
    if (!normalized) return;

    if (scannedBins.includes(normalized)) {
      setMessage(`Bin ${normalized} is already in the return list.`);
      setShowMessageModal(true);
      setCurrentBinId("");
      return;
    }

    setMessage("");

    const ok = await fetchBinComponents(normalized);
    if (ok) {
      setScannedBins((prev) => [...prev, normalized]);
    }

    setCurrentBinId("");
  };

  const handleKeyDown = (e) => {
    if (["input", "textarea"].includes(e.target.tagName.toLowerCase()) && e.key === "Enter") {
      e.preventDefault();
      const scanned = e.target.value.trim();
      if (scanned) {
        handleBinScan(scanned);
        e.target.value = "";
      }
    }
  };

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
      setMessage(`Bin ${binToRemove} removed from return list`);
      setShowMessageModal(true);
      setBinToRemove(null);
      setShowRemoveConfirmModal(false);
    }
  };

  const cancelRemove = () => {
    setBinToRemove(null);
    setShowRemoveConfirmModal(false);
  };

  // Confirm return to warehouse
  const handleConfirmReturn = async () => {
    if (scannedBins.length === 0) {
      setMessage("Please scan at least one bin to return.");
      setShowMessageModal(true);
      return;
    }

    setLoading(true);
    setMessage("Processing return to warehouse...");
    setShowMessageModal(true);

    try {
      // Call your backend API to update bin location, clear JTC, reset quantities
      const response = await axios.post("/api/return-bins-to-warehouse", {
        bins: scannedBins,
      });

      if (response.data.success) {
        setMessage(`Successfully returned ${scannedBins.length} bin(s) to warehouse.`);
        setShowMessageModal(true);
        setTimeout(() => {
          handleReset();
        }, 2000);
      } else {
        setMessage(response.data.error || "Error returning bins.");
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
    setScannedBins([]);
    setCurrentBinId("");
    setBinComponents({});
    setLoadingComponents({});
    setMessage("");
    setShowMessageModal(false);
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

  // Display components inside a bin
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
            <div
              key={idx}
              className="bg-white p-3 rounded border text-center shadow-sm"
              title={`Qty: ${component.quantity ?? "N/A"}`}
            >
              <div
                className="w-20 h-20 mx-auto mb-2 bg-gray-100 rounded border overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() =>
                  openImageModal(`src/assets/components/${component.id}.jpg`)
                }
              >
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

  // Card for each scanned bin
  const BinCard = ({ binId }) => {
    const binInfo = binComponents[binId] || {};
    return (
      <div className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-gray-700 font-semibold text-sm">
              📦 {binId}
            </span>
            {binInfo.jtc && (
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-200 whitespace-nowrap">
                🏷️ JTC: {binInfo.jtc}
              </span>
            )}
            {binInfo.location && (
              <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded border border-green-200 whitespace-nowrap">
                📍 Location: {binInfo.location}
              </span>
            )}
            {binInfo.remark && (
              <span className="text-xs italic text-purple-600 bg-purple-50 px-2 py-1 rounded whitespace-nowrap">
                📝 {binInfo.remark}
              </span>
            )}
          </div>
          <button
            onClick={() => confirmRemoveBin(binId)}
            className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50 transition-colors border border-red-200 flex-shrink-0"
            title={`Remove bin ${binId}`}
          >
            Remove
          </button>
        </div>
        <BinComponentsDisplay binId={binId} />
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
     

    {/* Input Area */}
<div className="max-w-2xl mx-auto">
  <div className="flex items-center gap-4">
    <label className="text-lg font-semibold text-gray-700 whitespace-nowrap">
      📥 Scan Bin to Return to Warehouse:
    </label>
    <input
      ref={binInputRef}
      type="text"
      className="border-2 border-green-300 rounded-lg px-6 py-3 flex-1 min-w-[320px] text-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
      value={currentBinId}
      onChange={(e) => setCurrentBinId(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="📱 Scan bin barcode and press Enter"
      disabled={loading}
      autoFocus
      style={{ minWidth: '320px' }}
    />
    {currentBinId && (
      <button
        className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 text-gray-700"
        onClick={() => setCurrentBinId("")}
        title="Clear"
        tabIndex={-1}
      >
        ✕
      </button>
    )}
  </div>
</div>

       {/* Confirm Return Button at Top */}
      <div className="flex justify-center mt-6">
        <button
          onClick={handleConfirmReturn}
          disabled={loading || scannedBins.length === 0}
          className={`px-8 py-3 rounded-lg font-semibold transition-colors ${
            loading || scannedBins.length === 0
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-green-600 text-white hover:bg-green-700"
          }`}
        >
          {loading ? "Processing..." : `✅ Confirm Return (${scannedBins.length} bins)`}
        </button>
      </div>

      {/* Scanned Bins Display in 2-column grid */}
      {scannedBins.length > 0 && (
        <div className="max-w-7xl mx-auto mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {scannedBins.map((binId) => (
            <BinCard key={binId} binId={binId} />
          ))}
        </div>
      )}

      {/* Message Display */}
      {message && !showMessageModal && (
        <div className="mt-4 text-center text-sm text-blue-700 p-3 bg-blue-50 rounded-lg max-w-2xl mx-auto">
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
            className="bg-white rounded-lg p-6 max-w-md w-full"
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
              aria-label="Close image modal"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Remove Confirmation Modal */}
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
              Are you sure you want to remove bin{" "}
              <span className="font-mono">{binToRemove}</span> from the return list?
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

export default ScanToWarehouseReturn;