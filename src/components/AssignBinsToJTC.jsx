import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import axios from "axios";
import JsBarcode from "jsbarcode";
import { pdf, Document, Page } from "@react-pdf/renderer";
import LabelPDFDocument from "./LabelPDFDocument";

const AssignBinsToJTC = forwardRef(({ currentStep, onStepChange }, ref) => {
  const [step, setStep] = useState(currentStep || 0);
  const [jtcId, setJtcId] = useState(""); // scanned barcode string
  const [jtcInfo, setJtcInfo] = useState(null); // full JTC info from DB
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

  const [binToReplace, setBinToReplace] = useState(null);
  const [pendingBinId, setPendingBinId] = useState(null);
  const [binToConfirmAdd, setBinToConfirmAdd] = useState(null);
  // Printing states
  const [printTrigger, setPrintTrigger] = useState(false);
  const [printBinData, setPrintBinData] = useState(null); // array of bins for multi-label PDF
  const [pdfUrl, setPdfUrl] = useState(null);
  const iframeRef = useRef(null);

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
      setPrintTrigger(false);
      setPrintBinData(null);
      setPdfUrl(null);
      if (onStepChange) onStepChange(0);
    }
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

const pdfUrlRef = useRef(null);

useEffect(() => {
  console.log("printBinData changed:", printBinData);
  if (!printBinData || printBinData.length === 0) {
    setPdfUrl(null);
    return;
  }

  const generatePdf = async () => {
    try {
      const singlePageDoc = (
        <Document>
          <Page size={{ width: 226.77, height: 198.43 }} style={{ padding: 2 }}>
            <LabelPDFDocument bin={printBinData} />
          </Page>
        </Document>
      );

      const asPdf = pdf();
      asPdf.updateContainer(singlePageDoc);
      const blob = await asPdf.toBlob();
      const url = URL.createObjectURL(blob);

      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
      }
      pdfUrlRef.current = url;
      console.log("PDF URL set:", url);

      setPdfUrl(url);
    } catch (error) {
      console.error("Error generating PDF:", error);
      setPdfUrl(null);
    }
  };

  generatePdf();

  return () => {
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    }
  };
}, [printBinData]);
  // Fetch bin info and check status
 const fetchBinComponents = async (binId) => {
  setLoadingComponents((prev) => ({ ...prev, [binId]: true }));
  try {
    const response = await axios.get(`/api/bin-info/${binId}`);
    const binData = response.data.bin;

    if (binData.status === "Pending JTC") {
      // OK to add directly
    } else if (binData.status === "Ready for Release") {
      // Show confirmation dialog to add anyway
      setBinToConfirmAdd(binId);
      return false; // pause adding until user confirms
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
      { id: binData.component_4, quantity: binData.quantity_c4 }
    ].filter((c) => c.id);

    setBinComponents((prev) => ({
      ...prev,
      [binId]: {
        components,
        remark: binData.remark ? binData.remark.trim() : null
      }
    }));
    return true;
  } catch (error) {
    setMessage(`Error fetching bin info for ${binId}.`);
    setShowMessageModal(true);
    setBinComponents((prev) => ({
      ...prev,
      [binId]: { components: [], remark: null }
    }));
    return false;
  } finally {
    setLoadingComponents((prev) => ({ ...prev, [binId]: false }));
  }
};

const generateBarcodeDataUrl = (text) => {
  console.log("genretating barcode");
    return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement("canvas");
      JsBarcode(canvas, text, { format: "CODE128" });
      const dataUrl = canvas.toDataURL("image/png");
      resolve(dataUrl);
    } catch (err) {
      reject(err);
    }
  });
};
  // Fetch JTC info by barcode and set state
const handleJtcScan = async (barcode) => {
  if (!barcode.trim()) return;
  setLoading(true);
  try {
    const response = await axios.get(`/api/jtc-info/${barcode.trim()}`);
    const jtc = response.data.jtc;
    setJtcInfo(jtc);
    setJtcId(barcode.trim());
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

const handleBinScan = async (binId) => {
  if (!binId.trim()) return;
  if (scannedBins.some((bin) => bin === binId)) {
    setMessage(`Bin ${binId} is already assigned to this JTC.`);
    setShowMessageModal(true);
    return;
  }
  setMessage("");
  const ok = await fetchBinComponents(binId.trim());
  if (ok) {
    setScannedBins((prev) => [...prev, binId.trim()]);
  }
};
// User confirms adding bin despite "Ready for Release" status
const confirmAddBin = async () => {
  if (!binToConfirmAdd) return;
  setScannedBins((prev) => [...prev, binToConfirmAdd]);
  setBinToConfirmAdd(null);
  setShowMessageModal(false);
};

// User cancels adding bin
const cancelAddBin = () => {
  setBinToConfirmAdd(null);
  setShowMessageModal(false);
};

  const handleKeyDown = (e, type) => {
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

  // Confirm assignment and then print labels
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
        jtc: jtcInfo.jtc_id, // send primary key here
        bins: scannedBins
      });

      if (response.data.success) {
        setMessage(`Successfully assigned ${scannedBins.length} bin(s) to JTC ${jtcInfo.jtc_orderNumber}} `);
        setShowMessageModal(true);
        setLoading(false);


// // Generate barcode image data URL from jtc_orderNumber
//     const barcodeDataUrl = await generateBarcodeDataUrl(jtcInfo.jtc_orderNumber);
//         setPrintBinData([{
//           jtc: jtcInfo.jtc_orderNumber,
//           component_1: "",
//           last_updated: "",
//           stock_code: "",
//           process_code: "",
//           emp_no: "",
//           quantity_c1: "",
//           remarks: jtcInfo.jtc_orderNumber,
//           barcodeDataUrl,  // pass barcode image here
//         }]);
   

   
//         // setPrintBinData(binsData);
//         setPrintTrigger(true);

      } else {
        setMessage(response.data.error || "Error assigning bins.");
        setShowMessageModal(true);
        setLoading(false);
      }
    } catch (error) {
      setMessage(error.response?.data?.error || "Network or server error.");
      setShowMessageModal(true);
      setLoading(false);
    }
  };

const closeMessageModal = () => {
  setShowMessageModal(false);
  setMessage("");
  // Reset everything on modal close
  setStep(0);
  setJtcId("");
  setJtcInfo(null);
  setScannedBins([]);
  setBinComponents({});
  setLoadingComponents({});
  setLoading(false);
  setPrintTrigger(false);
  setPrintBinData(null);
  setPdfUrl(null);
  if (onStepChange) onStepChange(0);
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

  return (
    <div>
      <div className="space-y-6">
        {/* Step 0: JTC Scan */}
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

        {/* Step 1: Bin Scan and Review */}
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

            {/* Current JTC Display */}
            <div className="max-w-4xl mx-auto">
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg border-l-8 border-purple-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="bg-white bg-opacity-20 p-3 rounded-full">
                      <span className="text-2xl">🏷️</span>
                    </div>
                    <div>
                      <h2 className="text-sm font-medium text-purple-100 uppercase tracking-wide">JTC Work Order</h2>
                      <p className="text-2xl font-bold font-mono">{jtcInfo?.jtc_orderNumber || jtcId}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-purple-100">Bins Assigned</p>
                    <p className="text-3xl font-bold">{scannedBins.length}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Scanned Bins Display */}
            {scannedBins.length > 0 && (
              <div className="max-w-7xl mx-auto mt-8">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="font-semibold text-blue-800 mb-6 text-xl">
                    📦 Assigned Bins ({scannedBins.length})
                  </h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {scannedBins.map((bin, idx) => (
                      <div key={idx} className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
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

            {/* Confirm Button at Bottom */}
            <div className="flex justify-center gap-4 mt-8">
              <button
                onClick={handleConfirmAssignment}
                disabled={loading}
                className={`px-8 py-3 rounded-lg font-semibold transition-colors ${loading
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-green-600 text-white hover:bg-green-700"
                  }`}
              >
                {loading ? "Saving..." : `✅ Confirm Assignment & Print`}
              </button>
            </div>
          </div>
        )}
      </div>

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
        Bin <span className="font-mono">{binToConfirmAdd}</span> is already assigned with status "Ready for Release".
        Do you want to add it anyway and replace the current assignment on save?
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

      {/* Message Modal with PDF preview */}
      {showMessageModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
          onClick={closeMessageModal}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-auto shadow-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ minWidth: "320px" }}
          >
            {/* Message */}
            <p className="text-center text-gray-900 text-lg font-semibold mb-6 leading-relaxed select-text">
              {message}
            </p>

            {/* PDF Preview */}
            {/* {printTrigger && (
              <>

                {pdfUrl ? (
                  <iframe
                    ref={iframeRef}
                    src={pdfUrl}
                    onLoad={() => console.log("PDF iframe loaded")}
                    style={{
                      width: "100%",
                      height: "420px",
                      border: "2px solid #4F46E5", // Indigo-600 border
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(79, 70, 229, 0.3)",
                      marginBottom: "1.5rem",
                    }}
                    title="Label Preview"
                  />
                ) : (
                  <p>loading preview...</p>
        )}

                <div className="flex justify-center gap-6">
                  <button
                    onClick={() => {
                      if (iframeRef.current) {
                        iframeRef.current.contentWindow.focus();
                        iframeRef.current.contentWindow.print();
                      }
                    }}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 transition-colors font-semibold"
                  >
                    Print
                  </button>
                  <button
                    onClick={() => {
                      setPrintTrigger(false);
                      setPrintBinData(null);
                      setPdfUrl(null);
                      closeMessageModal();
                    }}
                    className="px-6 py-2 bg-gray-300 rounded-lg shadow-md hover:bg-gray-400 transition-colors font-semibold"
                  >
                    Close
                  </button>
                </div>
              </>
            )} */}

            {/* OK button when not printing */}
              <div className="flex justify-center mt-6">
                <button
                  onClick={closeMessageModal}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors font-semibold"
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