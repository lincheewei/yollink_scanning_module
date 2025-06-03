import React, { useRef, useState } from "react";
import axios from "axios";

// --- Assign Multiple Bins to a JTC ---
function AssignBinsToJTC() {
  const [jtc, setJtc] = useState("");
  const [binId, setBinId] = useState("");
  const [assignedBins, setAssignedBins] = useState([]);
  const [message, setMessage] = useState("");
  const [sessionActive, setSessionActive] = useState(false);

  const jtcInputRef = useRef(null);
  const binInputRef = useRef(null);

  // When JTC is scanned, start session and focus bin input
  const handleJtcKeyDown = (e) => {
    if (e.key === "Enter" && jtc.trim()) {
      setSessionActive(true);
      setAssignedBins([]);
      setMessage("");
      setTimeout(() => binInputRef.current?.focus(), 100);
    }
  };

  // When Bin is scanned, assign and refocus bin input for next scan
  const handleBinKeyDown = async (e) => {
    if (e.key === "Enter" && binId.trim()) {
      setMessage("Assigning...");
      try {
        const res = await axios.post("/api/assign-bin", { jtc, bin_id: binId });
        if (res.data.success) {
          setAssignedBins((prev) => [...prev, binId]);
          setBinId("");
          setMessage("Bin assigned!");
        } else {
          setMessage(res.data.error || "Error assigning bin.");
        }
      } catch (err) {
        setMessage(err.response?.data?.error || "Network or server error.");
      }
      setTimeout(() => binInputRef.current?.focus(), 100);
    }
  };

  // Reset session (optional: add a reset button or hotkey)
  const handleReset = () => {
    setJtc("");
    setBinId("");
    setAssignedBins([]);
    setSessionActive(false);
    setMessage("");
    setTimeout(() => jtcInputRef.current?.focus(), 100);
  };

  return (
    <div>
      {!sessionActive ? (
        <div>
          <label className="block text-gray-700 font-semibold mb-2">
            JTC Barcode
          </label>
          <input
            ref={jtcInputRef}
            type="text"
            className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={jtc}
            onChange={(e) => setJtc(e.target.value)}
            onKeyDown={handleJtcKeyDown}
            placeholder="Scan JTC and press Enter"
            autoFocus
          />
        </div>
      ) : (
        <div>
          <div className="mb-4">
            <label className="block text-gray-700 font-semibold mb-2">
              JTC: <span className="font-mono">{jtc}</span>
            </label>
          </div>
          <label className="block text-gray-700 font-semibold mb-2">
            Bin Barcode
          </label>
          <input
            ref={binInputRef}
            type="text"
            className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={binId}
            onChange={(e) => setBinId(e.target.value)}
            onKeyDown={handleBinKeyDown}
            placeholder="Scan Bin and press Enter"
            autoFocus
          />
          <button
            type="button"
            className="w-full bg-gray-300 text-gray-800 font-semibold py-2 rounded-lg hover:bg-gray-400 transition-colors mt-2"
            onClick={handleReset}
          >
            Finish / Reset
          </button>
          {message && (
            <div className="mt-4 text-center text-sm text-blue-700">
              {message}
            </div>
          )}
          <div className="mt-6">
            <h3 className="font-semibold text-gray-700 mb-2">
              Assigned Bins for JTC <span className="font-mono">{jtc}</span>:
            </h3>
            <ul className="list-disc list-inside text-gray-600">
              {assignedBins.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Scan Bin and Components ---
function ScanBinItems() {
  const [binId, setBinId] = useState("");
  const [components, setComponents] = useState([""]);
  const [scannedBins, setScannedBins] = useState([]);
  const [message, setMessage] = useState("");

  const binInputRef = useRef(null);
  const compInputRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  // When Bin is scanned, focus first component
  const handleBinKeyDown = (e) => {
    if (e.key === "Enter" && binId.trim()) {
      setComponents([""]);
      setTimeout(() => compInputRefs[0].current?.focus(), 100);
    }
  };

  // When a component is scanned, move to next, or save if empty or last
  const handleComponentKeyDown = async (idx, e) => {
    if (e.key === "Enter") {
      if (components[idx].trim() && idx < 3) {
        // If not last and not empty, add next input if needed
        if (components.length < idx + 2) {
          setComponents((prev) => [...prev, ""]);
        }
        setTimeout(() => compInputRefs[idx + 1].current?.focus(), 100);
      } else {
        // If Enter on empty or last component, save
        await handleFinishBin();
      }
    }
  };

  // Save bin and components, reset for next bin
  const handleFinishBin = async () => {
    const filteredComponents = components.filter((c) => c.trim());
    if (!binId.trim() || filteredComponents.length === 0) {
      setMessage("Please scan at least 1 component for this bin.");
      return;
    }
    setMessage("Saving...");
    try {
      const res = await axios.post("/api/scan-bin", {
        bin_id: binId,
        components: [
          filteredComponents[0] || null,
          filteredComponents[1] || null,
          filteredComponents[2] || null,
          filteredComponents[3] || null,
        ],
      });
      if (res.data.success) {
        setScannedBins([...scannedBins, { binId, components: filteredComponents }]);
        setBinId("");
        setComponents([""]);
        setMessage("Components saved!");
        setTimeout(() => binInputRef.current?.focus(), 100);
      } else {
        setMessage(res.data.error || "Error saving components.");
      }
    } catch (err) {
      setMessage(err.response?.data?.error || "Network or server error.");
    }
  };

  // Add more component input fields (up to 4)
  const handleComponentChange = (idx, value) => {
    const newComps = [...components];
    newComps[idx] = value;
    // Add next input if not at max and current is filled
    if (
      value.trim() &&
      idx === components.length - 1 &&
      components.length < 4
    ) {
      newComps.push("");
    }
    setComponents(newComps.slice(0, 4));
  };

  return (
    <div>
      <label className="block text-gray-700 font-semibold mb-2">
        Bin Barcode
      </label>
      <input
        ref={binInputRef}
        type="text"
        className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={binId}
        onChange={(e) => setBinId(e.target.value)}
        onKeyDown={handleBinKeyDown}
        placeholder="Scan Bin and press Enter"
        autoFocus
        disabled={components.some((c) => c)}
      />
      {components.map((comp, idx) => (
        <div className="mb-4" key={idx}>
          <label className="block text-gray-700 font-semibold mb-2">
            Component {idx + 1}
          </label>
          <input
            ref={compInputRefs[idx]}
            type="text"
            className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={comp}
            onChange={(e) => handleComponentChange(idx, e.target.value)}
            onKeyDown={(e) => handleComponentKeyDown(idx, e)}
            placeholder={`Scan Component ${idx + 1} and press Enter`}
            disabled={!binId}
          />
        </div>
      ))}
      <button
        type="button"
        className="w-full bg-green-600 text-white font-semibold py-2 rounded-lg hover:bg-green-700 transition-colors mt-2"
        onClick={handleFinishBin}
        disabled={!binId || !components[0].trim()}
      >
        Finish Bin
      </button>
      {message && (
        <div className="mt-4 text-center text-sm text-blue-700">
          {message}
        </div>
      )}
      <div className="mt-6">
        <h3 className="font-semibold text-gray-700 mb-2">
          Scanned Bins:
        </h3>
        <ul className="list-disc list-inside text-gray-600">
          {scannedBins.map((b, i) => (
            <li key={i}>
              Bin: {b.binId} → Components: {b.components.join(", ")}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// --- Main App with Tabs ---
export default function App() {
  const [tab, setTab] = useState("assign");

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-lg p-8">
        {/* Tabs */}
        <div className="flex mb-8">
          <button
            className={`flex-1 py-2 font-semibold rounded-l-lg ${
              tab === "assign"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
            onClick={() => setTab("assign")}
          >
            Assign Bins to JTC
          </button>
          <button
            className={`flex-1 py-2 font-semibold rounded-r-lg ${
              tab === "scan"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
            onClick={() => setTab("scan")}
          >
            Scan Bin Items
          </button>
        </div>
        {tab === "assign" ? <AssignBinsToJTC /> : <ScanBinItems />}
      </div>
    </div>
  );
}