import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import axios from "axios";

const ScanToReleaseBin = forwardRef(({ onStepChange }, ref) => {
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
    }
  }));

  useEffect(() => {
    binInputRef.current?.focus();
  }, [scannedBins.length]);

  const fetchBinComponents = async (binId) => {
    setLoadingComponents(prev => ({ ...prev, [binId]: true }));
    try {
      const response = await axios.get(`/api/bin-info/${binId}`);
      const binData = response.data.bin;

      // Only allow bins with status "ready for release"
      if (binData.status !== "ready for release") {
        setMessage(
          `Bin ${binId} is not ready for release (current status: "${binData.status}"). ${
            binData.status === "pending JTC" 
              ? "Please assign this bin to a JTC first in the 'Assign Bins to JTC' tab."
              : binData.status === "released"
              ? "This bin has already been released."
              : "Please complete the scanning process for this bin first."
          }`
        );
        setShowMessageModal(true);
        setLoadingComponents(prev => ({ ...prev, [binId]: false }));
        return false;
      }

      const components = [
        { id: binData.component_1, quantity: binData.quantity_c1 },
        { id: binData.component_2, quantity: binData.quantity_c2 },
        { id: binData.component_3, quantity: binData.quantity_c3 },
        { id: binData.component_4, quantity: binData.quantity_c4 }
      ].filter(c => c.id);

      setBinComponents(prev => ({
        ...prev,
        [binId]: { 
          components, 
          remark: binData.remark ? binData.remark.trim() : null,
          jtc: binData.jtc || null,
          wc_id: binData.wc_id || "Unknown Workcell",
          station_id: binData.station_id || null,
          status: binData.status
        }
      }));
      return true;
    } catch (error) {
      setMessage(`Error fetching bin info for ${binId}.`);
      setShowMessageModal(true);
      setBinComponents(prev => ({
        ...prev,
        [binId]: { components: [], remark: null, jtc: null, wc_id: "Unknown Workcell", station_id: null, status: "unknown" }
      }));
      return false;
    } finally {
      setLoadingComponents(prev => ({ ...prev, [binId]: false }));
    }
  };

  // Group bins by workcell
  function groupBinsByWorkcell(bins, binComponents) {
    const grouped = {};
    bins.forEach(binId => {
      const binInfo = binComponents[binId];
      if (!binInfo) return;
      const wc = binInfo.wc_id || "Unknown Workcell";
      if (!grouped[wc]) grouped[wc] = [];
      grouped[wc].push(binId);
    });
    return grouped;
  }

  const handleBinScan = async (binId) => {
    if (!binId.trim()) return;
    if (scannedBins.includes(binId)) {
      setMessage(`Bin ${binId} is already in the release list.`);
      setShowMessageModal(true);
      setCurrentBinId("");
      return;
    }
    setMessage("");
    
    // Only add if status check passes
    const ok = await fetchBinComponents(binId.trim());
    if (ok) {
      setScannedBins(prev => [...prev, binId.trim()]);
    }
    setCurrentBinId("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleBinScan(currentBinId.trim());
    }
  };

  const confirmRemoveBin = (bin) => {
    setBinToRemove(bin);
    setShowRemoveConfirmModal(true);
  };

  const removeBin = () => {
    if (binToRemove) {
      setScannedBins(prev => prev.filter(bin => bin !== binToRemove));
      setBinComponents(prev => {
        const newComponents = { ...prev };
        delete newComponents[binToRemove];
        return newComponents;
      });
      setLoadingComponents(prev => {
        const newLoading = { ...prev };
        delete newLoading[binToRemove];
        return newLoading;
      });
      setMessage(`Bin ${binToRemove} removed from release list`);
      setShowMessageModal(true);
      setBinToRemove(null);
      setShowRemoveConfirmModal(false);
    }
  };

  const cancelRemove = () => {
    setBinToRemove(null);
    setShowRemoveConfirmModal(false);
  };

  const handleConfirmRelease = async () => {
    if (scannedBins.length === 0) {
      setMessage("Please scan at least one bin to release.");
      setShowMessageModal(true);
      return;
    }
    setLoading(true);
    setMessage("Processing release...");
    setShowMessageModal(true);

    try {
      const response = await axios.post("/api/release-bins", {
        bins: scannedBins
      });

      if (response.data.success) {
        setMessage(`Successfully released ${scannedBins.length} bin(s). Status updated to "released".`);
        setShowMessageModal(true);
        setTimeout(() => {
          handleReset();
        }, 2000);
      } else {
        setMessage(response.data.error || "Error releasing bins.");
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
                  onClick={() => openImageModal(`src/assets/components/${component.id}.jpg`)}
                  onError={(e) => {
                    if (e.target.src.endsWith('.jpg')) {
                      e.target.src = `src/assets/components/${component.id}.png`;
                    } else if (e.target.src.endsWith('.png')) {
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

  const BinCard = ({ binId }) => {
    const binInfo = binComponents[binId] || {};
    return (
      <div className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-gray-700 font-semibold text-sm">
              📦 {binId}
            </span>
            {/* Status Badge */}
             {binInfo.jtc && (
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-200">
                🏷️ JTC: {binInfo.jtc}
              </span>
            )}
                {binInfo.station_id && (
              <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-200">
                🛰️ Station {binInfo.station_id}
              </span>
            )}
            {binInfo.remark && (
              <span className="text-xs italic text-purple-600 bg-purple-50 px-2 py-1 rounded">
                📝 {binInfo.remark}
              </span>
            )}
        
        
          </div>
          <button
            onClick={() => confirmRemoveBin(binId)}
            className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50 transition-colors border border-red-200 flex-shrink-0"
          >
            Remove
          </button>
        </div>
        <BinComponentsDisplay binId={binId} />
      </div>
    );
  };

  const groupedBins = groupBinsByWorkcell(scannedBins, binComponents);

  return (
    <div>
      <div className="space-y-6">
        {/* Input Area with Title */}
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
            <label className="text-lg font-semibold text-gray-700 whitespace-nowrap">
              📤 Scan Bin:
            </label>
            <input
              ref={binInputRef}
              type="text"
              className="border-2 border-green-300 rounded-lg px-4 py-3 flex-1 text-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              value={currentBinId}
              onChange={(e) => setCurrentBinId(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="📱 Scan bin barcode and press Enter (Ready for Release only)"
              disabled={loading}
              autoFocus
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
          
          {/* Status Information */}
          {/* <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-700 text-center">
              ℹ️ Only bins with JTC assigned can be scanned here.
            </p>
          </div> */}
        </div>

        {/* Workcell-Based Display - 2 Columns */}
        {scannedBins.length > 0 && (
          <div className="max-w-7xl mx-auto mt-8">
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              {/* <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-green-700">
                  📤 Bins Ready for Release ({scannedBins.length})
                </h3>
                <p className="text-sm text-green-600 mt-2">
                  All bins below have been verified and are ready to be released
                </p>
              </div> */}
              
              <div className="space-y-8">
                {Object.entries(groupedBins).map(([workcell, binIds]) => (
                  <div key={workcell} className="border-b border-gray-200 pb-8 last:border-b-0">
                    {/* Workcell Header */}
                    <div className="text-center mb-6">
                      <h4 className="text-xl font-bold text-green-700 bg-green-100 px-6 py-3 rounded-lg border border-green-300 inline-block">
                        Workcell: {workcell} ({binIds.length} bins)
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {binIds.map((binId) => (
                        <BinCard key={`${workcell}-${binId}`} binId={binId} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Confirm Release Button */}
        <div className="flex justify-center mt-8">
          <button
            onClick={handleConfirmRelease}
            disabled={loading || scannedBins.length === 0}
            className={`px-8 py-3 rounded-lg font-semibold transition-colors ${
              loading || scannedBins.length === 0
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-green-600 text-white hover:bg-green-700"
            }`}
          >
            {loading ? "Processing..." : `✅ Confirm Release (${scannedBins.length} bins)`}
          </button>
        </div>
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
              Are you sure you want to remove bin <span className="font-mono">{binToRemove}</span> from the release list?
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

export default ScanToReleaseBin;