import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
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

  // BOM related states
  const [bomList, setBomList] = useState([]); // {componentId, quantityPerItem, totalQuantity, checked}
  const [checkedComponents, setCheckedComponents] = useState({}); // {componentId: true/false}
  const [currentJtcId, setCurrentJtcId] = useState(null);
  const [currentJtcQuantityNeeded, setCurrentJtcQuantityNeeded] = useState(1);
  const [totalJtcAssignedBins, setTotalJtcAssignedBins] = useState(0);
  const [currentJtcInfo, setCurrentJtcInfo] = useState(null);
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
      setBomList([]);
      setCheckedComponents({});
      setCurrentJtcId(null);
      setCurrentJtcQuantityNeeded(1);
      setCurrentJtcInfo(null);
      if (onStepChange) onStepChange(0);
    },
  }));

  useEffect(() => {
    binInputRef.current?.focus();
  }, [scannedBins.length]);

  useEffect(() => {
    if (!currentJtcId) {
      setTotalJtcAssignedBins(0);
      return;
    }

    const fetchAssignedBinsCount = async () => {
      try {
        const response = await axios.get(`/api/jtc-assigned-bins-count/${currentJtcId}`);
        if (response.data.success) {
          setTotalJtcAssignedBins(response.data.assignedBinsCount);
        } else {
          setTotalJtcAssignedBins(0);
        }
      } catch (error) {
        console.error('Failed to fetch assigned bins count:', error);
        setTotalJtcAssignedBins(0);
      }
    };

    fetchAssignedBinsCount();
  }, [currentJtcId]);

  // Fetch bin info, JTC info, and BOM list, update states accordingly
  const fetchBinComponents = async (binId) => {
    setLoadingComponents((prev) => ({ ...prev, [binId]: true }));
    try {
      const response = await axios.get(`/api/bin-info/${binId}`);
      const binData = response.data.bin;
      console.log("Bin Data:", binData);

      if (!binData) {
        setMessage(`Bin ${binId} not found.`);
        setShowMessageModal(true);
        return { success: false, jtc: null };
      }

      if (binData.status !== "Ready for Release") {
        setMessage(
          `Bin ${binId} is not ready for release (status: "${binData.status}"). ${binData.status === "Pending JTC"
            ? "Please assign this bin to a JTC first in the 'Assign Bins to JTC' tab."
            : binData.status === "Released"
              ? "This bin has already been released."
              : "Please complete the scanning process for this bin first."
          }`
        );
        setShowMessageModal(true);
        return { success: false, jtc: null };
      }

      // Check if bin's JTC matches current JTC (if any)
      if (currentJtcId && binData.jtc !== currentJtcId) {
        setMessage(
          `Bin ${binId} belongs to a different JTC (${binData.jtc}). Please complete or reset the current JTC before scanning bins from another.`
        );
        setShowMessageModal(true);
        return { success: false, jtc: binData.jtc };
      }

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
          wc_id: binData.wc_id || "Unknown Workcell",
          station_id: binData.station_id || null,
          status: binData.status,
        },
      }));

      // If no current JTC, or JTC changed, fetch JTC info and BOM list
      if (binData.jtc && binData.jtc !== currentJtcId) {
        setCurrentJtcId(binData.jtc);

        // Fetch JTC info by jtc_id
        const jtcResponse = await axios.get(`/api/jtc-info-by-id/${binData.jtc}`);
        const jtcInfo = jtcResponse.data.jtc;
        setCurrentJtcInfo(jtcInfo);  // <-- store full info here
        console.log("JTC Info:", jtcInfo);

        if (jtcInfo && jtcInfo.jtc_RevId) {
          const quantityNeeded = jtcInfo.jtc_quantityNeeded || 1;
          setCurrentJtcQuantityNeeded(quantityNeeded);

          // Fetch BOM list by jtc_RevId
          const bomResponse = await axios.get(`/api/jtc-bom/${jtcInfo.jtc_RevId}`);
          const bomItems = bomResponse.data.bom || [];

          // Multiply quantity per item by quantityNeeded
          const bomWithTotalQty = bomItems.map((item) => ({
            componentId: item.component_id,
            quantityPerItem: item.jtc_QuantityPerItem,
            totalQuantity: (item.quantity_per_item || 0) * quantityNeeded,
            checked: false,
          }));

          setBomList(bomWithTotalQty);
          setCheckedComponents({});
        }
      }

      // Update checkedComponents based on scanned bin components
      setCheckedComponents((prevChecked) => {
        const newChecked = { ...prevChecked };
        components.forEach((c) => {
          newChecked[c.id] = true;
        });
        return newChecked;
      });

      return { success: true, jtc: binData.jtc || null };
    } catch (error) {
      setMessage(`Error fetching bin info for ${binId}.`);
      setShowMessageModal(true);
      return { success: false, jtc: null };
    } finally {
      setLoadingComponents((prev) => ({ ...prev, [binId]: false }));
    }
  };

  // Group bins by workcell
  function groupBinsByWorkcell(bins, binComponents) {
    const grouped = {};
    bins.forEach((binId) => {
      const binInfo = binComponents[binId];
      if (!binInfo) return;
      const wc = binInfo.wc_id || "Unknown Workcell";
      if (!grouped[wc]) grouped[wc] = [];
      grouped[wc].push(binId);
    });
    return grouped;
  }

  const handleBinScan = async (binId) => {
    const normalized = binId.trim().toUpperCase();
    if (!normalized) return;

    // Prevent duplicate
    if (scannedBins.includes(normalized)) {
      setMessage(`Bin ${normalized} is already in the release list.`);
      setShowMessageModal(true);
      setCurrentBinId("");
      return;
    }

    setMessage("");

    // Fetch bin components and get JTC info
    const { success, jtc } = await fetchBinComponents(normalized);

    if (!success) {
      setCurrentBinId("");
      return;
    }

    // If no current JTC, set it now (optional, if not handled inside fetchBinComponents)
    if (!currentJtcId && jtc) {
      setCurrentJtcId(jtc);
    }

    // Add bin to scanned list
    setScannedBins((prev) => [...prev, normalized]);
    setCurrentBinId("");
  };

  const handleKeyDown = (e) => {
    const isInput = ["input", "textarea"].includes(e.target.tagName.toLowerCase());

    if (!isInput) return;

    if (e.key === "Enter") {
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

      // Update checkedComponents by removing components from removed bin
      setCheckedComponents((prevChecked) => {
        const newChecked = { ...prevChecked };
        const removedBinComponents = binComponents[binToRemove]?.components || [];
        removedBinComponents.forEach((c) => {
          // Check if this component still exists in other bins
          const stillExists = scannedBins.some((bin) => {
            if (bin === binToRemove) return false;
            const comps = binComponents[bin]?.components || [];
            return comps.some((comp) => comp.id === c.id);
          });
          if (!stillExists) {
            delete newChecked[c.id];
          }
        });
        return newChecked;
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

    // Check if all BOM components are checked
    const allChecked = bomList.every((item) => checkedComponents[item.componentId]);
    if (!allChecked) {
      setMessage(
        "Not all BOM components are scanned. Please scan all required bins before release."
      );
      setShowMessageModal(true);
      return;
    }

    setLoading(true);
    setMessage("Processing release...");
    setShowMessageModal(true);

    try {
      const response = await axios.post("/api/release-bins", {
        bins: scannedBins,
      });

      if (response.data.success) {
        setMessage(
          `Successfully released ${scannedBins.length} bin(s). Status updated to "Released".`
        );
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
    setBomList([]);
    setCheckedComponents({});
    setCurrentJtcId(null);
    setCurrentJtcQuantityNeeded(1);
    setCurrentJtcInfo(null);
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
        <div className="grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] gap-3">
          {components.map((component, idx) => (
            <div
              key={idx}
              className="bg-white p-3 rounded border text-center shadow-sm w-28 mx-auto"
              title={`Qty: ${component.quantity ?? "N/A"}`}
            >
              <div
                className="w-20 h-20 mx-auto mb-2 bg-gray-100 rounded border overflow-hidden cursor-pointer hover:shadow-lg transition-shadow flex justify-center items-center"
                onClick={() =>
                  openImageModal(`src/assets/components/${component.id}.jpg`)
                }
              >
                <img
                  src={`src/assets/components/${component.id}.jpg`}
                  alt={component.id}
                  className="block max-w-full max-h-full object-contain m-auto"
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
              <div
                className="text-xs text-gray-700 truncate font-medium mb-1"
                title={component.id}
              >
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

            {binInfo.station_id && Array.isArray(binInfo.station_id) && (
              <div className="flex flex-wrap gap-1">
                {binInfo.station_id && Array.isArray(binInfo.station_id) && (
                  <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-200 whitespace-nowrap">
                    Station {binInfo.station_id.join(",")}
                  </span>
                )}
              </div>
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

  const groupedBins = groupBinsByWorkcell(scannedBins, binComponents);

  // Calculate progress for BOM checklist
  const totalBOM = bomList.length;
  const checkedCount = bomList.filter((item) => checkedComponents[item.componentId]).length;
  const progressPercent = totalBOM === 0 ? 0 : Math.round((checkedCount / totalBOM) * 100);
  const allChecked = totalBOM > 0 && checkedCount === totalBOM;

  return (
    <div className="min-h-screen pb-24 max-w-full mx-auto px-4 sm:px-6 lg:px-8">

      {/* If no bins scanned, vertically center input */}
      {scannedBins.length === 0 ? (
        <div className="min-h-[calc(100vh-6rem)] flex flex-col justify-center items-center">
          <div className="w-full flex items-center gap-4">
            <label
              htmlFor="binInput"
              className="text-lg font-semibold text-gray-700 whitespace-nowrap"
            >
              📤 Scan Bin:
            </label>
            <div className="flex-1 flex items-center gap-2">
              <input
                id="binInput"
                ref={binInputRef}
                type="text"
                className={`border-2 rounded-lg px-6 py-3 w-full min-w-[600px] text-lg focus:outline-none focus:ring-2 ${loading
                  ? "border-gray-300 bg-gray-100 cursor-not-allowed"
                  : "border-green-300 focus:ring-green-500 focus:border-green-500"
                  }`}
                value={currentBinId}
                onChange={(e) => setCurrentBinId(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="📱 Scan bin barcode and press Enter (Ready for Release only)"
                disabled={loading}
                autoFocus
                aria-describedby="binInputHelp"
              />
              {currentBinId && !loading && (
                <button
                  className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 text-gray-700"
                  onClick={() => setCurrentBinId("")}
                  title="Clear"
                  tabIndex={-1}
                  aria-label="Clear input"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          <p
            id="binInputHelp"
            className="text-sm text-gray-500 mt-1 text-center w-full max-w-2xl px-4"
          >
            Scan bins with status "Ready for Release" only.
          </p>
        </div>
      ) : (
        // If bins scanned, show input normally at top + display area below
        <>
          {/* Input area at top without vertical centering */}
          <div className="max-w-5xl mx-auto mt-6 flex items-center gap-4">
            <label
              htmlFor="binInput"
              className="text-lg font-semibold text-gray-700 whitespace-nowrap"
            >
              📤 Scan Bin:
            </label>
            <div className="flex-1 flex items-center gap-2">
              <input
                id="binInput"
                ref={binInputRef}
                type="text"
                className={`border-2 rounded-lg px-6 py-3 w-full min-w-[600px] text-lg focus:outline-none focus:ring-2 ${loading
                  ? "border-gray-300 bg-gray-100 cursor-not-allowed"
                  : "border-green-300 focus:ring-green-500 focus:border-green-500"
                  }`}
                value={currentBinId}
                onChange={(e) => setCurrentBinId(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="📱 Scan bin barcode and press Enter (Ready for Release only)"
                disabled={loading}
                autoFocus
                aria-describedby="binInputHelp"
              />
              {currentBinId && !loading && (
                <button
                  className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 text-gray-700"
                  onClick={() => setCurrentBinId("")}
                  title="Clear"
                  tabIndex={-1}
                  aria-label="Clear input"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Display area */}
          <>
            {/* Conditionally show JTC Info + Confirm Release Button */}
            {currentJtcId && (
              <div className="max-w-5xl mx-auto mt-8 px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-center justify-between gap-6">
                {/* JTC Info Card */}
                <div className="flex-1 min-w-0">
                  <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg border-l-8 border-purple-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4 min-w-0">
                        <div className="bg-white bg-opacity-20 p-3 rounded-full flex-shrink-0">
                          <span className="text-2xl">🏷️</span>
                        </div>
                        <div className="truncate">
                          <h2 className="text-sm font-medium text-purple-100 uppercase tracking-wide truncate">
                            JTC Work Order
                          </h2>
                          <p className="text-2xl font-bold font-mono truncate">
                            {currentJtcInfo?.jtc_orderNumber || currentJtcId}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm text-purple-100">Bins Assigned</p>
                        <p className="text-3xl font-bold">{scannedBins.length}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Confirm Release Button */}
                <div className="flex-shrink-0 w-full lg:w-auto flex flex-col items-center lg:items-end gap-2">
                  <div
                    className={`w-full max-w-xs p-4 rounded-lg text-center mb-1 ${scannedBins.length === totalJtcAssignedBins && totalJtcAssignedBins > 0
                      ? "bg-green-50 border border-green-200 text-green-800"
                      : "bg-yellow-50 border border-yellow-200 text-yellow-800"
                      }`}
                  >
                    <p className="font-semibold text-sm mb-1">
                      {scannedBins.length === totalJtcAssignedBins && totalJtcAssignedBins > 0
                        ? "✅ All bins scanned"
                        : "⚠️ Bin Scan Status"}
                    </p>
                    <p className="text-xs">
                      {scannedBins.length} / {totalJtcAssignedBins} bins scanned
                    </p>
                  </div>
                  <button
                    onClick={handleConfirmRelease}
                    disabled={!allChecked || loading || scannedBins.length === 0}
                    className={`w-full lg:w-auto px-8 py-3 rounded-lg font-semibold transition-colors shadow-lg ${!allChecked || loading || scannedBins.length === 0
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-700"
                      }`}
                    aria-disabled={!allChecked || loading || scannedBins.length === 0}
                    aria-label={`Confirm release of ${scannedBins.length} bins`}
                    title={
                      !allChecked
                        ? "Please scan all BOM components before releasing"
                        : undefined
                    }
                  >
                    {loading ? "Processing..." : `✅ Confirm Release (${scannedBins.length} bins)`}
                  </button>
                </div>
              </div>
            )}

            {/* Main Content: BOM Checklist + Scanned Bins */}
            <div className="mt-10 grid grid-cols-1 lg:grid-cols-5 gap-2 max-w-7xl mx-auto">
              {/* BOM Checklist with progress */}
              <div className="col-span-1 max-w-xs bg-white p-4 rounded-lg shadow border border-gray-200 sticky top-6 max-h-[80vh] overflow-y-auto">
                <h4 className="text-lg font-semibold mb-2">
                  BOM Checklist
                </h4>
                <p className="text-sm mb-4">
                  JTC: <span className="font-mono">{currentJtcId || "-"}</span> | Qty Needed: {currentJtcQuantityNeeded}
                </p>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="w-full bg-gray-200 rounded-full h-4">
                    <div
                      className="bg-green-600 h-4 rounded-full transition-all"
                      style={{ width: `${progressPercent}%` }}
                      aria-valuenow={progressPercent}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      role="progressbar"
                    ></div>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {checkedCount} of {totalBOM} components scanned ({progressPercent}%)
                  </p>
                </div>

                <ul className="space-y-2">
                  {bomList.map(({ componentId, totalQuantity }) => (
                    <li
                      key={componentId}
                      className="flex items-center justify-between select-none px-2 py-1 rounded hover:bg-gray-50 cursor-default"
                      title={`Required quantity: ${totalQuantity}`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!checkedComponents[componentId]}
                          readOnly
                          className="w-5 h-5 cursor-default"
                          aria-label={`Component ${componentId} scanned status`}
                        />
                        <span className="font-mono truncate max-w-[120px]">{componentId}</span>
                      </div>
                      <span className="text-sm text-gray-600 font-semibold whitespace-nowrap">
                        Qty: {totalQuantity}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Scanned Bins Display */}
              <div className="col-span-4 max-w-full overflow-x-hidden">
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 space-y-8 max-h-[80vh] overflow-y-auto">
                  {Object.entries(groupedBins).map(([workcell, binIds]) => (
                    <div key={workcell} className="pb-8 last:border-b-0">
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
          </>
        </>
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
          role="dialog"
          aria-modal="true"
          aria-labelledby="messageModalTitle"
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p
              id="messageModalTitle"
              className="text-center text-gray-800 mb-4 flex items-center justify-center gap-2"
            >
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z"
                />
              </svg>
              {message}
            </p>
            <div className="flex justify-center">
              <button
                onClick={closeMessageModal}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          role="dialog"
          aria-modal="true"
          aria-label="Component image preview"
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
          role="dialog"
          aria-modal="true"
          aria-labelledby="removeConfirmTitle"
        >
          <div
            className="bg-white rounded-lg p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="removeConfirmTitle" className="text-lg font-semibold mb-4">
              Confirm Removal
            </h2>
            <p className="mb-6 text-gray-700">
              Are you sure you want to remove bin{" "}
              <span className="font-mono">{binToRemove}</span> from the release list?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelRemove}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={removeBin}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600"
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