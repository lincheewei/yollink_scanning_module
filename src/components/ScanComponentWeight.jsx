import React, { useRef, useState } from "react";
import axios from "axios";

function ScanComponentWeight() {
  const [componentId, setComponentId] = useState("");
  const [weight, setWeight] = useState("");
  const [quantity, setQuantity] = useState("");
  const [scannedComponents, setScannedComponents] = useState([]);
  const [message, setMessage] = useState("");
  const [showMessageModal, setShowMessageModal] = useState(false);

  const compInputRef = useRef(null);
  const weightInputRef = useRef(null);
  const qtyInputRef = useRef(null);

  // Fetch weight from scale API
  const fetchWeightFromScale = async () => {
    setMessage("Getting weight from scale...");
    setShowMessageModal(true);
    try {
      const res = await axios.get(
        `/api/get-scale-reading?component=${encodeURIComponent(componentId)}`
      );
      if (res.data.success && res.data.actualWeight !== null) {
        setMessage("");
        setShowMessageModal(false);
        return res.data.actualWeight.toString();
      } else {
        setMessage("No scale reading available");
        setShowMessageModal(true);
        return "";
      }
    } catch (err) {
      console.error("Error fetching scale reading:", err);
      setMessage("Error getting scale reading");
      setShowMessageModal(true);
      return "";
    }
  };

  // Handle component scan
  const handleComponentKeyDown = async (e) => {
    if (e.key === "Enter" && componentId.trim()) {
      const fetchedWeight = await fetchWeightFromScale();
      setWeight(fetchedWeight);
      setTimeout(() => weightInputRef.current?.focus(), 100);
    }
  };

  // Handle weight entry
  const handleWeightKeyDown = (e) => {
    if (e.key === "Enter" && weight.trim()) {
      setTimeout(() => qtyInputRef.current?.focus(), 100);
    }
  };

  // Handle quantity entry and save
  const handleQuantityKeyDown = async (e) => {
    if (e.key === "Enter" && quantity.trim()) {
      await handleSave();
    }
  };

  // Save the record to database
  const handleSave = async () => {
    if (!componentId.trim() || !weight.trim() || !quantity.trim()) {
      setMessage("Please fill all fields.");
      setShowMessageModal(true);
      return;
    }

    setMessage("Saving...");
    setShowMessageModal(true);
    try {
      const res = await axios.post("/api/record-component-weight", {
        componentId: componentId.trim(),
        weight: parseFloat(weight),
        quantity: parseInt(quantity),
      });

      if (res.data.success) {
        setScannedComponents((prev) => [
          ...prev,
          {
            componentId: componentId.trim(),
            weight: parseFloat(weight),
            quantity: parseInt(quantity),
            recordedAt: new Date().toLocaleString(),
          },
        ]);

        setComponentId("");
        setWeight("");
        setQuantity("");
        setMessage("Component weight recorded successfully!");
        setShowMessageModal(true);

        setTimeout(() => {
          compInputRef.current?.focus();
          setMessage("");
          setShowMessageModal(false);
        }, 1500);
      } else {
        setMessage(res.data.error || "Error saving component weight.");
        setShowMessageModal(true);
      }
    } catch (err) {
      console.error("Error saving component weight:", err);
      setMessage(err.response?.data?.error || "Network or server error.");
      setShowMessageModal(true);
    }
  };

  const closeMessageModal = () => {
    setShowMessageModal(false);
    setMessage("");
  };

  return (
    <div>
      <label className="block text-gray-700 font-semibold mb-2">
        Component Barcode
      </label>
      <input
        ref={compInputRef}
        type="text"
        className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={componentId}
        onChange={(e) => setComponentId(e.target.value)}
        onKeyDown={handleComponentKeyDown}
        placeholder="Scan Component and press Enter"
        autoFocus
      />

      <label className="block text-gray-700 font-semibold mb-2 mt-4">
        Weight (kg)
      </label>
      <div className="flex items-center">
        <input
          ref={weightInputRef}
          type="number"
          step="0.001"
          min="0"
          className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onKeyDown={handleWeightKeyDown}
          placeholder="Enter or fetch weight and press Enter"
        />
        <button
          type="button"
          className="bg-blue-500 text-white px-3 py-2 rounded-lg ml-2 hover:bg-blue-600 transition-colors"
          onClick={async () => {
            if (!componentId.trim()) {
              setMessage("Please scan component first");
              setShowMessageModal(true);
              return;
            }
            const fetchedWeight = await fetchWeightFromScale();
            if (fetchedWeight) {
              setWeight(fetchedWeight);
              setTimeout(() => qtyInputRef.current?.focus(), 100);
            }
          }}
        >
          Get from Scale
        </button>
      </div>

      <label className="block text-gray-700 font-semibold mb-2 mt-4">
        Quantity per Bulk
      </label>
      <input
        ref={qtyInputRef}
        type="number"
        min="1"
        className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        onKeyDown={handleQuantityKeyDown}
        placeholder="Enter quantity and press Enter"
      />

      <button
        type="button"
        className={`w-full font-semibold py-3 rounded-lg transition-colors mt-4 ${
          !componentId.trim() || !weight.trim() || !quantity.trim()
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-green-600 text-white hover:bg-green-700"
        }`}
        onClick={handleSave}
        disabled={!componentId.trim() || !weight.trim() || !quantity.trim()}
      >
        Save Component Weight
      </button>

      {/* Message Alert Modal */}
      {showMessageModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={closeMessageModal}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p
              className={`text-center mb-4 ${
                message.toLowerCase().includes("error")
                  ? "text-red-600"
                  : message.toLowerCase().includes("success")
                  ? "text-green-600"
                  : "text-blue-600"
              }`}
            >
              {message}
            </p>
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

      <div className="mt-6">
        <h3 className="font-semibold text-gray-700 mb-2">
          Recorded Components:
        </h3>
        {scannedComponents.length === 0 ? (
          <p className="text-gray-500 text-sm">No components recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {scannedComponents.map((c, i) => (
              <li key={i} className="bg-gray-50 p-3 rounded-lg border">
                <div className="text-sm">
                  <div>
                    <span className="font-semibold">Component:</span> {c.componentId}
                  </div>
                  <div>
                    <span className="font-semibold">Weight:</span> {c.weight} kg
                  </div>
                  <div>
                    <span className="font-semibold">Qty per Bulk:</span> {c.quantity}
                  </div>
                  {c.recordedAt && (
                    <div className="text-gray-500">
                      <span className="font-semibold">Recorded:</span> {c.recordedAt}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default ScanComponentWeight;