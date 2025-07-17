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
  const [releasedBins, setReleasedBins] = useState([]); // {binId, releaseDateTime, components, ...}
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
      setReleasedBins([]);
      if (onStepChange) onStepChange(0);
    },
  }));


  // Function to focus the bin input
  const focusInput = () => {
    if (binInputRef.current) {
      binInputRef.current.focus();
    }
  };

  useEffect(() => {
    // Focus input on mount
    focusInput();

    // Refocus input on clicks outside buttons and modals
    const handleGlobalClick = (e) => {
      const tag = e.target.tagName.toLowerCase();
      const isButton = tag === "button" || e.target.closest("button");
      const isModal = e.target.closest(".modal") || e.target.classList.contains("modal");

      if (!isButton && !isModal) {
        focusInput();
      }
    };

    document.addEventListener("click", handleGlobalClick);

    return () => {
      document.removeEventListener("click", handleGlobalClick);
    };
  }, []);

  useEffect(() => {
    if (!currentJtcId) {
      setTotalJtcAssignedBins(0);
      setReleasedBins([]);
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

  // Aggregate quantities of each component across all scanned bins + released bins
  const aggregateComponentQuantities = () => {
    const componentQuantities = {};

    scannedBins.forEach((bin) => {
      const comps = binComponents[bin]?.components || [];
      comps.forEach(({ id, quantity }) => {
        componentQuantities[id] = (componentQuantities[id] || 0) + (quantity || 0);
      });
    });

    releasedBins.forEach(({ components }) => {
      components.forEach(({ id, quantity }) => {
        componentQuantities[id] = (componentQuantities[id] || 0) + (quantity || 0);
      });
    });

    return componentQuantities;
  };

  // Update checkedComponents based on aggregated quantities and BOM
  useEffect(() => {
    if (bomList.length === 0) {
      setCheckedComponents({});
      return;
    }

    const componentQuantities = aggregateComponentQuantities();

    const newChecked = {};
    Object.entries(componentQuantities).forEach(([compId, totalQty]) => {
      const bomItem = bomList.find(item => item.componentId === compId);
      if (bomItem) {
        newChecked[compId] = totalQty >= bomItem.totalQuantity;
      } else {
        newChecked[compId] = false;
      }
    });

    setCheckedComponents(newChecked);
  }, [bomList, binComponents, scannedBins, releasedBins]);

  // Calculate cumulative scanned quantities for all components (scanned + released)
  const cumulativeQuantities = aggregateComponentQuantities();

  // Determine if a bin is ready based on cumulative quantities
  const isBinReady = (binId) => {
    const binComps = binComponents[binId]?.components || [];

    for (const comp of binComps) {
      const bomItem = bomList.find(item => item.componentId === comp.id);
      if (!bomItem) continue; // component not in BOM, ignore

      const cumulativeQty = cumulativeQuantities[comp.id] || 0;
      if (cumulativeQty < bomItem.totalQuantity) {
        return false;
      }
    }
    return true;
  };

  // Build binReadyMap using this logic
  const binReadyMap = {};
  scannedBins.forEach(binId => {
    binReadyMap[binId] = isBinReady(binId);
  });

  function formatMalaysiaTime(dateString) {
    if (!dateString) return "N/A";
    const date = new Date(dateString);

    const time = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kuala_Lumpur",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    }).format(date);

    const datePart = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kuala_Lumpur",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);

    return `${time} ${datePart}`;
  }

  // Helper: fetch released bins and update BOM for a given JTC
  const fetchReleasedBinsForJtc = async (jtcId) => {
    try {
      const binsResponse = await axios.get(`/api/bins-by-jtc/${jtcId}`);
      const bins = binsResponse.data.bins || [];
      console.log("Fetched released bins:", bins);
      const allBinComponents = {};
      const releasedBinsData = [];

      for (const bId of bins) {
        const compResp = await axios.get(`/api/bin-info/${bId}`);
        const bData = compResp.data.bin;
        console.log("Fetched bin components:", bData.last_updated);
        if (!bData || bData.status !== "Released") continue;

        const components = (compResp.data.components || []).map((c) => ({
          id: c.component_id,
          quantity: c.actual_quantity,
        }));

        allBinComponents[bId] = {
          components,
          remark: bData.remark ? bData.remark.trim() : null,
          jtc: bData.jtc || null,
          wc_id: bData.wc_id || "Unknown Workcell",
          station_id: bData.station_id || null,
          status: bData.status,
          isReleased: true,
          releaseDateTime: bData.last_updated || null,
        };

        releasedBinsData.push({
          binId: bId,
          releaseDateTime: bData.last_updated || null,
          components,
          remark: bData.remark ? bData.remark.trim() : null,
          wc_id: bData.wc_id || "Unknown Workcell",
          station_id: bData.station_id || null,
        });
      }

      setBinComponents((prev) => ({ ...prev, ...allBinComponents }));
      setReleasedBins(releasedBinsData);

      // Fetch JTC info and BOM
      try {
        const jtcResponse = await axios.get(`/api/jtc-info-by-id/${jtcId}`);
        const jtcInfo = jtcResponse.data.jtc;
        setCurrentJtcInfo(jtcInfo);
        if (jtcInfo && jtcInfo.jtc_RevId) {
          const quantityNeeded = jtcInfo.jtc_quantityNeeded || 1;
          setCurrentJtcQuantityNeeded(quantityNeeded);

          const bomResponse = await axios.get(`/api/jtc-bom/${jtcInfo.jtc_RevId}`);
          const bomItems = bomResponse.data.bom || [];

          // Aggregate released components quantities
          const releasedComponentsAggregate = {};
          releasedBinsData.forEach(({ components }) => {
            components.forEach(({ id, quantity }) => {
              releasedComponentsAggregate[id] = (releasedComponentsAggregate[id] || 0) + quantity;
            });
          });

          const bomWithTotalQty = bomItems.map((item) => {
            const totalQuantity = (item.quantity_per_item || 0) * quantityNeeded;
            const scannedQty = releasedComponentsAggregate[item.component_id] || 0;
            return {
              componentId: item.component_id,
              quantityPerItem: item.jtc_QuantityPerItem,
              totalQuantity,
              scannedQuantity: scannedQty,
              checked: scannedQty >= totalQuantity,
            };
          });

          setBomList(bomWithTotalQty);
          setCheckedComponents({});
        }
      } catch (jtcError) {
        console.error("Failed to fetch JTC info or BOM for released bins:", jtcError);
        setCurrentJtcInfo(null);
        setBomList([]);
        setCheckedComponents({});
      }
    } catch (error) {
      console.error("Failed to fetch released bins for JTC:", error);
      setReleasedBins([]);
    }
  };

  // Fetch bin info, JTC info, and BOM list, update states accordingly
  const fetchBinComponents = async (binId) => {
    setLoadingComponents((prev) => ({ ...prev, [binId]: true }));
    try {
      const response = await axios.get(`/api/bin-info/${binId}`);
      const binData = response.data.bin;
      console.log("binData", binData);

      if (!binData) {
        setMessage(`Bin ${binId} not found.`);
        setShowMessageModal(true);
        return { success: false, jtc: null };
      }

      if (binData.status === "Released") {
        if (binData.jtc) {
          // Fetch all released bins for this JTC and update BOM
          await fetchReleasedBinsForJtc(binData.jtc);

          setScannedBins([]); // Clear scanned bins when loading released bins
          setCurrentJtcId(binData.jtc);

          setMessage(`All released bins for JTC ${binData.jtc} loaded.`);
          setShowMessageModal(true);

          return { success: true, jtc: binData.jtc, isReleased: true };
        } else {
          setMessage(`Bin ${binId} is released but has no JTC assigned.`);
          setShowMessageModal(true);
          return { success: false, jtc: null };
        }
      }

      if (binData.status !== "Ready for Release") {
        setMessage(
          `Bin ${binId} is not ready for release (status: "${binData.status}"). ${binData.status === "Pending JTC"
            ? "Please assign this bin to a JTC first in the 'Assign Bins to JTC' tab."
            : "Please complete the scanning process for this bin first."
          }`
        );
        setShowMessageModal(true);
        return { success: false, jtc: null };
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
          isReleased: false,
        },
      }));

      // If no current JTC, or JTC changed, fetch JTC info and BOM list
      if (binData.jtc && binData.jtc !== currentJtcId) {
        setCurrentJtcId(binData.jtc);

        // Fetch released bins for this JTC to update BOM and released bins area
        await fetchReleasedBinsForJtc(binData.jtc);
      }

      return { success: true, jtc: binData.jtc || null, isReleased: false };
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

    // Prevent duplicate in scanned bins
    if (scannedBins.includes(normalized)) {
      setMessage(`Bin ${normalized} is already in the release list.`);
      setShowMessageModal(true);
      setCurrentBinId("");
      return;
    }

    // Prevent duplicate in released bins
    if (releasedBins.find((b) => b.binId === normalized)) {
      setMessage(`Bin ${normalized} is already released and shown below.`);
      setShowMessageModal(true);
      setCurrentBinId("");
      return;
    }

    setMessage("");

    // Fetch bin components and get JTC info
    const { success, jtc, isReleased } = await fetchBinComponents(normalized);

    if (!success) {
      setCurrentBinId("");
      return;
    }

    if (isReleased) {
      // Released bins loaded, clear scanned bins (already done in fetchBinComponents)
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

  // Confirm release button enabled if at least one bin is ready
  // Only release bins that are ready individually
  const binsReadyToRelease = scannedBins.filter(binId => binReadyMap[binId]);
  const anyBinReady = binsReadyToRelease.length > 0;

  const handleConfirmRelease = async () => {
    if (scannedBins.length === 0) {
      setMessage("Please scan at least one bin to release.");
      setShowMessageModal(true);
      return;
    }

    if (!anyBinReady) {
      setMessage(
        "No scanned bin fully meets BOM requirements. Please scan bins with required components."
      );
      setShowMessageModal(true);
      return;
    }

    setLoading(true);
    setMessage("Processing release...");
    setShowMessageModal(true);

    try {
      const response = await axios.post("/api/release-bins", {
        bins: binsReadyToRelease,
      });

      if (response.data.success) {
        setMessage(
          `Successfully released ${binsReadyToRelease.length} bin(s). Status updated to "Released".`
        );
        setShowMessageModal(true);
        // Remove released bins from scanned list and binComponents
        setScannedBins((prev) => prev.filter(bin => !binsReadyToRelease.includes(bin)));
        setBinComponents((prev) => {
          const newComponents = { ...prev };
          binsReadyToRelease.forEach(bin => delete newComponents[bin]);
          return newComponents;
        });

        // Refresh released bins list and BOM checklist after release
        if (currentJtcId) {
          await fetchReleasedBinsForJtc(currentJtcId);
        }

        setTimeout(() => {
          if (scannedBins.length === binsReadyToRelease.length) {
            // All bins released, reset
            handleReset();
          }
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
    setReleasedBins([]);
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
  const readyBinCount = scannedBins.filter(bin => isBinReady(bin)).length;

  // Card for each scanned bin with ready/not ready indicator
  const BinCard = ({ binId }) => {
    const binInfo = binComponents[binId] || {};
    const ready = binReadyMap[binId];
    return (
      <div
        className={`bg-white border rounded-lg p-4 shadow-sm mb-4 flex flex-col ${ready ? "border-green-500" : "border-red-400 opacity-80"
          }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-gray-700 font-semibold text-sm">
              📦 {binId}
            </span>
            {ready ? (
              <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded whitespace-nowrap">
                Ready
              </span>
            ) : (
              <span className="text-xs text-red-700 bg-red-100 px-2 py-1 rounded whitespace-nowrap">
                Not Ready
              </span>
            )}

            {binInfo.station_id && Array.isArray(binInfo.station_id) && (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-200 whitespace-nowrap">
                  Station {binInfo.station_id.join(",")}
                </span>
              </div>
            )}
            {binInfo.remark && (
              <span className="text-xs italic text-purple-600 bg-purple-50 px-2 py-1 rounded whitespace-nowrap">
                📝 {binInfo.remark}
              </span>
            )}
            {binInfo.isReleased && (
              <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded whitespace-nowrap">
                Released
              </span>
            )}
          </div>
          <button
            onClick={() => confirmRemoveBin(binId)}
            className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50 transition-colors border border-red-200 flex-shrink-0"
            title={`Remove bin ${binId}`}
            disabled={binInfo.isReleased}
          >
            Remove
          </button>
        </div>
        <BinComponentsDisplay binId={binId} />
      </div>
    );
  };

  // Released bin card for tracking
  const ReleasedBinCard = ({ bin }) => {
    const { binId, releaseDateTime, components, remark, wc_id, station_id } = bin;
    return (
      <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 shadow-sm mb-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-gray-700 font-semibold text-sm">
              📦 {binId}
            </span>
            <span className="text-xs text-gray-600 bg-gray-200 px-2 py-1 rounded whitespace-nowrap">
              Released: {formatMalaysiaTime(releaseDateTime)}
            </span>
            {station_id && Array.isArray(station_id) && (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-200 whitespace-nowrap">
                  Station {station_id.join(",")}
                </span>
              </div>
            )}
            {remark && (
              <span className="text-xs italic text-purple-600 bg-purple-50 px-2 py-1 rounded whitespace-nowrap">
                📝 {remark}
              </span>
            )}
          </div>
        </div>
        <div className="mt-3 p-3 bg-white border border-gray-200 rounded">
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
      </div>
    );
  };

  const groupedBins = groupBinsByWorkcell(scannedBins, binComponents);
  const groupedReleasedBins = groupBinsByWorkcell(
    releasedBins.map(b => b.binId),
    binComponents
  );

  // BOM checklist progress
  const totalBOM = bomList.length;
  const checkedCount = bomList.filter((item) => checkedComponents[item.componentId]).length;

  return (
    <div
      className={`max-w-full mx-auto px-4 sm:px-6 lg:px-8 ${scannedBins.length === 0
        ? "min-h-screen flex flex-col justify-center"
        : "min-h-screen pb-24"
        }`}
    >
      {/* Input area */}
      <div
        className={`max-w-5xl mx-auto flex items-center gap-4 ${scannedBins.length === 0 ? "justify-center" : "mt-6"
          }`}
      >        <label
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
        className="text-sm text-gray-500 mt-1 text-center w-full max-w-2xl mx-auto"
      >
        Scan bins with status "Ready for Release" only.
      </p>

      {currentJtcId && (() => {
        const releasedCount = releasedBins.length;
        const assignedCount = totalJtcAssignedBins;

        // Determine card color based on release progress
        let cardBg = "from-purple-500 to-purple-600 border-purple-700"; // purple default
        let statusText = "No bins released yet";
        let statusTextColor = "text-purple-100";
        let statusBg = "bg-purple-600";

        if (releasedCount === assignedCount && assignedCount > 0) {
          cardBg = "from-green-500 to-green-600 border-green-700";
          statusText = "All bins released";
          statusTextColor = "text-green-100";
          statusBg = "bg-green-600";
        } else if (releasedCount > 0 && releasedCount < assignedCount) {
          cardBg = "from-yellow-400 to-yellow-500 border-yellow-600";
          statusText = "Release in progress";
          statusTextColor = "text-yellow-100";
          statusBg = "bg-yellow-500";
        }

        return (
          <div className="max-w-7xl mx-auto mt-6 px-6 sm:px-8 lg:px-10 flex flex-col lg:flex-row items-center justify-between gap-8">
            {/* JTC Info Card with dynamic colors */}
            <div className="flex-1 min-w-[400px]">
              <div
                className={`bg-gradient-to-r ${cardBg} text-white p-6 rounded-xl shadow-lg border-l-8`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 min-w-0">
                    <div className="bg-white bg-opacity-20 p-3 rounded-full flex-shrink-0">
                      <span className="text-2xl">🏷️</span>
                    </div>
                    <div className="truncate">
                      <h2 className="text-sm font-medium uppercase tracking-wide truncate">
                        JTC Work Order
                      </h2>
                      <p className="text-2xl font-bold font-mono truncate">
                        {currentJtcInfo?.jtc_orderNumber || currentJtcId}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 min-w-[180px] flex space-x-8 justify-end">

                    <div className="flex flex-col items-center">
                      <p className="text-sm opacity-80">Bins Released</p>
                      <p className="text-3xl font-bold">{releasedCount}</p>
                    </div>
                    <div className="w-px h-14 bg-white bg-opacity-60"></div>
                    <div className="flex flex-col items-center">
                      <p className="text-sm opacity-80">Bins Assigned</p>
                      <p className="text-3xl font-bold">{assignedCount}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Confirm Release Button or All Released Message */}
            <div className="flex-shrink-0 w-full lg:w-auto flex flex-col items-center lg:items-end gap-4">
              {/* Release Status Badge above button */}

              {scannedBins.length > 0 && (
                <button
                  onClick={handleConfirmRelease}
                  disabled={!anyBinReady || loading || scannedBins.length === 0}
                  className={`w-full lg:w-auto px-8 py-3 rounded-lg font-semibold transition-colors shadow-lg ${!anyBinReady || loading || scannedBins.length === 0
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-green-600 text-white hover:bg-green-700"
                    }`}
                  aria-disabled={!anyBinReady || loading || scannedBins.length === 0}
                  aria-label={`Confirm release of ready bins`}
                  title={
                    !anyBinReady
                      ? "No bins meet BOM requirements for release"
                      : undefined
                  }
                >
                  {loading ? "Processing..." : `✅ Confirm Release (${readyBinCount} ready bins)`}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Main content area: 2 columns */}
      <div className="mt-10 max-w-12xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* BOM Checklist */}
        {currentJtcId && (
          <div className="col-span-1 bg-white p-4 rounded-lg shadow border border-gray-200 sticky top-6 max-h-[80vh] overflow-y-auto">
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
                  style={{ width: `${totalBOM === 0 ? 0 : Math.round((checkedCount / totalBOM) * 100)}%` }}
                  aria-valuenow={totalBOM === 0 ? 0 : Math.round((checkedCount / totalBOM) * 100)}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  role="progressbar"
                ></div>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {checkedCount} of {totalBOM} components scanned ({totalBOM === 0 ? 0 : Math.round((checkedCount / totalBOM) * 100)}%)
              </p>
            </div>

            <ul className="space-y-2">
              {bomList.map(({ componentId, totalQuantity }) => {
                const scannedQty = cumulativeQuantities[componentId] || 0;
                let bgColor = "bg-red-100 text-red-800"; // default: not scanned (red)
                if (scannedQty >= totalQuantity) {
                  bgColor = "bg-green-100 text-green-800"; // complete (green)
                } else if (scannedQty > 0 && scannedQty < totalQuantity) {
                  bgColor = "bg-yellow-100 text-yellow-800"; // partial (yellow)
                }

                return (
                  <li
                    key={componentId}
                    className={`${bgColor} flex items-center justify-between select-none px-2 py-1 rounded cursor-default hover:brightness-95 transition`}
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
                    <span className="text-sm font-semibold whitespace-nowrap text-right w-20">
                      {scannedQty} / {totalQuantity}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}


        {/* Scanned bins area */}
        {scannedBins.length > 0 && (
          <div className="col-span-4 max-w-full overflow-x-hidden">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 space-y-8 max-h-[80vh] overflow-y-auto">
              {Object.entries(groupBinsByWorkcell(scannedBins, binComponents)).map(([workcell, binIds]) => (
                <div key={workcell} className="pb-8 last:border-b-0">
                  <h4 className="text-sm font-semibold mb-3 text-gray-600">{workcell}</h4>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {binIds.map((binId) => (
                      <BinCard key={`${workcell}-${binId}`} binId={binId} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Released bins area below scanned bins */}
            {releasedBins.length > 0 && (
              <div className="mt-10">

                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6 space-y-4">
                  {Object.entries(groupedReleasedBins).map(([workcell, binIds]) => (
                    <div key={workcell} className="pb-8 last:border-b-0">
                      <h4 className="text-sm font-semibold mb-3 text-gray-600">{workcell}</h4>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {binIds.map((binId) => {
                          const bin = releasedBins.find(b => b.binId === binId);
                          return bin ? <ReleasedBinCard key={binId} bin={bin} /> : null;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* If no scanned bins but released bins exist, show released bins full width */}
        {scannedBins.length === 0 && releasedBins.length > 0 && (
          <div className="col-span-4 max-w-full overflow-x-hidden ">

            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6 space-y-4">
              {Object.entries(groupedReleasedBins).map(([workcell, binIds]) => (
                <div key={workcell} className="pb-8 last:border-b-0">
                  <h4 className="text-sm font-semibold mb-3 text-gray-600">{workcell}</h4>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {binIds.map((binId) => {
                      const bin = releasedBins.find(b => b.binId === binId);
                      return bin ? <ReleasedBinCard key={binId} bin={bin} /> : null;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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