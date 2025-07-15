import React, { useRef, useState } from "react";
import axios from "axios";

import ScanComponentWeight from "./components/ScanComponentWeight";
import AssignBinsToJTC from "./components/AssignBinsToJTC";
import ScanBinItems from "./components/ScanBinItems";
import ScanToReleaseBin from "./components/ScanToReleaseBin";
import ScanBinItems2 from "./components/ScanBinItems2";
import ScanToWarehouseReturn from "./components/ScanToWarehouseReturn";

import { Buffer } from "buffer";
window.Buffer = window.Buffer || Buffer;



// Color map for each tab - Production-friendly, clear color coding with brighter indicator colors
const tabColors = {
  assign: {
    icon: "📦",
    color: "blue",
    bg: "bg-blue-50",
    border: "border-blue-600",
    text: "text-blue-700",
    step: "bg-blue-600",
    stepBorder: "border-blue-600",
    progressBg: "bg-blue-600",
    indicator: "#60a5fa" // blue-400 - brighter blue
  },
  scan: {
    icon: "🔍",
    color: "green",
    bg: "bg-green-50",
    border: "border-green-600",
    text: "text-green-700",
    step: "bg-green-600",
    stepBorder: "border-green-600",
    progressBg: "bg-green-600",
    indicator: "#34d399" // green-400 - brighter green
  },
  release: {
    icon: "📤",
    color: "purple",
    bg: "bg-purple-50",
    border: "border-purple-600",
    text: "text-purple-700",
    step: "bg-purple-600",
    stepBorder: "border-purple-600",
    progressBg: "bg-purple-600",
    indicator: "#a78bfa" // purple-400 - brighter purple
  },
  warehouseReturn: {
    icon: "🏭",
    color: "teal",
    bg: "bg-teal-50",
    border: "border-teal-600",
    text: "text-teal-700",
    step: "bg-teal-600",
    stepBorder: "border-teal-600",
    progressBg: "bg-teal-600",
    indicator: "#14b8a6" // teal-400
  },

  scanComponentWeight: {
    icon: "⚖️",
    color: "orange",
    bg: "bg-orange-50",
    border: "border-orange-600",
    text: "text-orange-700",
    step: "bg-orange-600",
    stepBorder: "border-orange-600",
    progressBg: "bg-orange-600",
    indicator: "#fdba74" // orange-300 - brighter orange
  }
};

// Horizontal indicator line breathing animation CSS
const indicatorLineStyles = `
@keyframes indicator-breath {
  0%   { opacity: 0.7; box-shadow: 0 0 8px 2px var(--indicator-color); }
  50%  { opacity: 1;   box-shadow: 0 0 32px 8px var(--indicator-color); }
  100% { opacity: 0.7; box-shadow: 0 0 8px 2px var(--indicator-color); }
}
.indicator-line {
  height: 20px;
  width: 200px;
  border-radius: 8px;
  background: var(--indicator-color);
  margin: 0 1.5rem;
  animation: indicator-breath 1.8s ease-in-out infinite;
  box-shadow: 0 0 8px 2px var(--indicator-color);
  display: inline-block;
  transition: background 0.3s;
}
@media (max-width: 1024px) {
  .indicator-line {
    width: 100px;
    height: 10px;
    margin: 0 1rem;
  }
}
@media (max-width: 768px) {
  .indicator-line {
    width: 80px;
    height: 10px;
    margin: 0 0.5rem;
  }
}
`;

const ProcessStepsCard = ({ activeTab, onImageClick, currentStep, onStepClick, onResetAll }) => {
  const processSteps = {
    assign: [
      {
        id: 0,
        title: "Scan JTC Barcode",
        image: "src/assets/JTC-barcode.png",
        placeholder: "https://placehold.co/200x200/3b82f6/ffffff?text=JTC"
      },
      {
        id: 1,
        title: "Scan Bin Barcodes",
        image: "src/assets/bin-qr.png",
        placeholder: "https://placehold.co/200x200/3b82f6/ffffff?text=Bins"
      },
    ],
    scan: [
      {
        id: 0,
        title: "Scan Bin",
        image: "src/assets/bin-qr.png",
        placeholder: "https://placehold.co/200x200/10b981/ffffff?text=Bin"
      },
      {
        id: 1,
        title: "Scan Components",
        image: "src/assets/component-qr.png",
        placeholder: "https://placehold.co/200x200/10b981/ffffff?text=Components"
      },
      {
        id: 2,
        title: "Scan JTC (Optional)",
        image: "src/assets/JTC-barcode.png",
        placeholder: "https://placehold.co/200x200/10b981/ffffff?text=JTC"
      }
    ],
    release: [
      {
        id: 0,
        title: "Scan Bins to Release",
        image: "src/assets/bin-qr.png",
        placeholder: "https://placehold.co/200x200/8b5cf6/ffffff?text=Release"
      },
    ],
    scanComponentWeight: [
      {
        id: 0,
        title: "Scan Component",
        image: "/images/weight-step1-component.jpg",
        placeholder: "https://placehold.co/200x200/f97316/ffffff?text=Component"
      },
      {
        id: 1,
        title: "Place on Scale",
        image: "/images/weight-step2-scale.jpg",
        placeholder: "https://placehold.co/200x200/f97316/ffffff?text=Scale"
      },
      {
        id: 2,
        title: "Record Weight",
        image: "/images/weight-step3-record.jpg",
        placeholder: "https://placehold.co/200x200/f97316/ffffff?text=Record"
      }
    ],
    warehouseReturn: [
      {
        id: 0,
        title: "Scan Bin for Return",
        image: "src/assets/bin-qr.png",
        placeholder: "https://placehold.co/200x200/14b8a6/ffffff?text=Bin"
      },

    
    ],
  };

  const currentSteps = processSteps[activeTab];
  if (!currentSteps) return null;

  const getStepStatus = (stepId) => {
    if (activeTab === 'scanComponentWeight') return 'default';
    if (stepId < currentStep) return 'completed';
    if (stepId === currentStep) return 'active';
    return 'pending';
  };

  const tabColor = tabColors[activeTab] || tabColors.assign;

  const getTabTitle = (tab) => {
    const titles = {
      assign: "Process Steps",
      scan: "Process Steps",
      release: "Process Steps",
      scanComponentWeight: "Process Steps",
      warehouseReturn: "Process Steps"
    };
    return titles[tab] || "Process Steps";
  };

  return (
    <div className="w-full lg:w-1/4 xl:w-1/5">
      <div className="bg-white rounded-lg shadow-lg p-4 sticky top-4 flex flex-col h-[calc(100vh-6rem)] min-h-[600px]">
        {/* Steps at the top - flex-grow to take available space */}
        <div className="flex-grow">
          <h2 className={`text-lg font-bold mb-4 ${tabColor.text}`}>
            {tabColor.icon} {getTabTitle(activeTab)}
          </h2>
          <div className="space-y-4">
            {currentSteps.map((step) => {
              const status = getStepStatus(step.id);
              const isClickable = activeTab === 'scan' || activeTab === 'assign' || activeTab === 'release';
              const isActive = status === 'active';
              const isCompleted = status === 'completed';

              return (
                <div
                  key={step.id}
                  className={`
                    flex items-stretch p-4 rounded-lg transition-all duration-200 border-2 relative
                    ${isActive ? `${tabColor.stepBorder} ${tabColor.bg} shadow-md` :
                      isCompleted ? "border-green-300 bg-green-50" :
                        "border-gray-200 bg-gray-50"}
                    ${isClickable ? "cursor-pointer hover:shadow-lg" : ""}
                  `}
                  onClick={() => {
                    if (isClickable && onStepClick) {
                      onStepClick(step.id);
                    }
                  }}
                  style={{ cursor: isClickable ? 'pointer' : 'default', minHeight: '140px' }}
                >
                  {/* Status indicator */}
                  {isActive && (
                    <div className="absolute top-2 right-2 w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center animate-pulse z-10">
                      <span className="text-white text-xs">●</span>
                    </div>
                  )}
                  {/* Step Number - Top Left */}
                  <div className={`absolute top-2 left-2 w-8 h-8 ${isCompleted ? 'bg-green-600' : tabColor.step
                    } text-white rounded-full flex items-center justify-center text-sm font-bold z-10`}>
                    {isCompleted ? '✓' : step.id + 1}
                  </div>

                  {/* Image Area - 40% */}
                  <div className="flex-shrink-0 flex items-center justify-center relative" style={{ flexBasis: "60%" }}>
                    <div className="relative w-full h-full flex items-center justify-center">
                      <img
                        src={step.image}
                        alt={step.title}
                        className="w-50 h-40 rounded-lg border-2 border-gray-200 cursor-pointer hover:shadow-xl hover:border-blue-300 transition-all duration-200 object-cover"
                        onClick={(e) => {
                          e.stopPropagation();
                          onImageClick(step.image);
                        }}
                        onError={(e) => {
                          e.target.src = step.placeholder;
                        }}
                      />

                    </div>
                  </div>

                  {/* Text Area - 60% */}
                  <div className="flex-1 pl-4 flex flex-col justify-center">
                    <div className={`font-semibold text-gray-800 text-xl leading-tight ${isActive ? tabColor.text : isCompleted ? 'text-green-700' : ''
                      }`}>
                      {step.title}
                      {isActive && <span className="ml-2 text-blue-600 text-lg"></span>}
                    </div>
                    {/* Add click hint for pending steps */}
                    {status === 'pending' && isClickable && (
                      <div className="text-xs text-blue-500 mt-2">Click to jump to this step</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress indicator */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs text-gray-500 text-center">
              {(activeTab === 'scan' || activeTab === 'assign' || activeTab === 'release') ? (
                <>Step {currentStep + 1} of {currentSteps.length}</>
              ) : (
                <>{currentSteps.length} steps to complete</>
              )}
            </div>
            {(activeTab === 'scan' || activeTab === 'assign' || activeTab === 'release') && (
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div
                  className={`${tabColor.progressBg} h-2 rounded-full transition-all duration-300`}
                  style={{ width: `${((currentStep + 1) / currentSteps.length) * 100}%` }}
                ></div>
              </div>
            )}
          </div>
        </div>

        {/* Reset All Button - always at the bottom */}
        <div className="mt-4 pt-4 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={onResetAll}
            className="w-full px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors border border-red-200 text-sm font-medium"
          >
            🔄 Reset All
          </button>
        </div>
      </div>
    </div>
  );
};

// Collapsible Navigation Bar Component with Horizontal Breathing Indicator Lines
const CollapsibleNavbar = ({ activeTab, onTabChange, tabs }) => {
  const [isOpen, setIsOpen] = useState(false);

  const getTabColor = (tabKey) => {
    const colors = {
      assign: {
        active: "bg-gradient-to-r from-blue-500 to-blue-700 text-white border-b-4 border-blue-800 shadow-lg",
        inactive: "bg-blue-50 text-blue-700 hover:bg-blue-100 border-b-4 border-transparent hover:border-blue-200"
      },
      scan: {
        active: "bg-gradient-to-r from-green-500 to-green-700 text-white border-b-4 border-green-800 shadow-lg",
        inactive: "bg-green-50 text-green-700 hover:bg-green-100 border-b-4 border-transparent hover:border-green-200"
      },
      release: {
        active: "bg-gradient-to-r from-purple-500 to-purple-700 text-white border-b-4 border-purple-800 shadow-lg",
        inactive: "bg-purple-50 text-purple-700 hover:bg-purple-100 border-b-4 border-transparent hover:border-purple-200"
      },
      scanComponentWeight: {
        active: "bg-gradient-to-r from-orange-500 to-orange-700 text-white border-b-4 border-orange-800 shadow-lg",
        inactive: "bg-orange-50 text-orange-700 hover:bg-orange-100 border-b-4 border-transparent hover:border-orange-200"
      }
    };
    return colors[tabKey] || colors.assign;
  };

  const tabColor = tabColors[activeTab] || tabColors.assign;

  // Get current tab title for display
  const getCurrentTabTitle = () => {
    const currentTab = tabs.find(t => t.key === activeTab);
    return currentTab ? currentTab.label : "Select Process";
  };

  return (
    <>
      {/* Horizontal Indicator Line Animation Styles */}
      <style dangerouslySetInnerHTML={{ __html: indicatorLineStyles }} />

      <nav className="bg-white shadow-lg mb-4 rounded-lg">
        <div className="px-6 py-4">
          {/* Header with Toggle Button (Always Visible) */}
          <div className="flex items-center justify-between">
            <div className="flex-1 flex justify-center items-center">
              {/* Left Horizontal Indicator Line */}
              <span
                className="indicator-line"
                style={{ "--indicator-color": tabColor.indicator }}
              />

              {/* Main Title */}
              <h1 className={`text-4xl lg:text-5xl font-extrabold uppercase tracking-widest text-center ${tabColor.text}`}>
                {tabColor.icon} {getCurrentTabTitle()}
              </h1>

              {/* Right Horizontal Indicator Line */}
              <span
                className="indicator-line"
                style={{ "--indicator-color": tabColor.indicator }}
              />
            </div>

            <button
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ml-4"
              aria-label="Toggle navigation"
            >
              <span className="text-sm font-medium hidden sm:inline">
                {isOpen ? 'Hide Menu' : 'Show Menu'}
              </span>
              <svg className="w-6 h-6 transition-transform duration-200"
                style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>

          {/* Collapsible Navigation Content (Always Collapsible) */}
          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-96 opacity-100 mt-6' : 'max-h-0 opacity-0'
            }`}>
            {/* Navigation Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              {tabs.map(({ key, label }) => {
                const colors = getTabColor(key);
                const color = tabColors[key] || tabColors.assign;
                const isActive = activeTab === key;

                return (
                  <button
                    key={key}
                    className={`
                      min-w-0 truncate
                      px-2 py-2 lg:px-3 lg:py-2
                      font-bold rounded-xl transition-all duration-300
                      text-sm lg:text-base shadow-sm
                      ${isActive ? colors.active.replace('scale-105', '') : colors.inactive}
                    `}
                    style={{ maxWidth: '100%' }}
                    onClick={() => {
                      onTabChange(key);
                      setIsOpen(false);
                    }}
                  >
                    <div className="flex items-center justify-center space-x-2 min-w-0">
                      <span className="truncate">{color.icon} {label}</span>
                      {isActive && (
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Process Description */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-2">
                  {activeTab === 'assign' && 'Assign bins to work orders before processing'}
                  {activeTab === 'scan' && 'Scan and validate bin contents with weight checks'}
                  {activeTab === 'release' && 'Release completed bins from the system'}
                  {activeTab === 'scanComponentWeight' && 'Record component weights for inventory'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
};

// --- Main App with Improved Layout ---
export default function App() {
  const [tab, setTab] = useState("assign");
  const [modalImg, setModalImg] = useState(null);
  const [scanCurrentStep, setScanCurrentStep] = useState(0);
  const [assignCurrentStep, setAssignCurrentStep] = useState(0);
  const [releaseCurrentStep, setReleaseCurrentStep] = useState(0);
  const [warehouseReturnCurrentStep, setWarehouseReturnCurrentStep] = useState(0);
  // Create refs for each component
  const assignBinsRef = useRef();
  const scanBinItemsRef = useRef();
  const scanToReleaseRef = useRef();
  const scanToWarehouseReturnRef = useRef();
  const handleImageClick = (imageSrc) => {
    setModalImg(imageSrc);
  };
  const handleStepClick = (stepId) => {
    if (tab === 'scan') {
      setScanCurrentStep(stepId);
    } else if (tab === 'assign') {
      setAssignCurrentStep(stepId);
    } else if (tab === 'release') {
      setReleaseCurrentStep(stepId);
    } else if (tab === 'warehouseReturn') {
      setWarehouseReturnCurrentStep(stepId);
    }
  };

  const handleTabChange = (newTab) => {
    setTab(newTab);
    if (newTab === 'scan') {
      setScanCurrentStep(0);
    } else if (newTab === 'assign') {
      setAssignCurrentStep(0);
    } else if (newTab === 'release') {
      setReleaseCurrentStep(0);
    } else if (newTab === 'warehouseReturn') {
      setWarehouseReturnCurrentStep(0);
    }
  };

  const handleResetAll = () => {
    setScanCurrentStep(0);
    setAssignCurrentStep(0);
    setReleaseCurrentStep(0);
    setWarehouseReturnCurrentStep(0);

    assignBinsRef.current?.resetComponent();
    scanBinItemsRef.current?.resetComponent();
    scanToReleaseRef.current?.resetComponent();
    scanToWarehouseReturnRef.current?.resetComponent();
  };

  const tabs = [
    { key: "assign", label: "Assign Bins to JTC" },
    { key: "scan", label: "Scan Bin Items" },
    { key: "release", label: "Warehouse to Production" },
    { key: "warehouseReturn", label: "Production to Warehouse" },  // <-- new tab
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-2 flex flex-col">
      <div className="flex-1 flex flex-col">
        {/* Collapsible Navigation Bar with Horizontal Breathing Indicator Lines */}
        <CollapsibleNavbar
          activeTab={tab}
          onTabChange={handleTabChange}
          tabs={tabs}
        />

        {/* Main Content Area - fills remaining space */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
          {/* Process Steps Card - Sidebar */}
          <ProcessStepsCard
            activeTab={tab}
            onImageClick={handleImageClick}
            currentStep={
              tab === 'scan' ? scanCurrentStep :
                tab === 'assign' ? assignCurrentStep :
                  tab === 'release' ? releaseCurrentStep : 0
            }
            onStepClick={handleStepClick}
            onResetAll={handleResetAll}
          />

          {/* Main Content Card - fills remaining space and centers content */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 bg-white rounded-lg shadow-lg p-4 flex flex-col justify-center min-h-[calc(100vh-12rem)]">
              <div className="flex-1 flex flex-col justify-center">
                {tab === "assign" && (
                  <AssignBinsToJTC
                    ref={assignBinsRef}
                    currentStep={assignCurrentStep}
                    onStepChange={setAssignCurrentStep}
                  />
                )}
                {tab === "scan" && (
                  <ScanBinItems2
                    ref={scanBinItemsRef}
                    currentStep={scanCurrentStep}
                    onStepChange={setScanCurrentStep}
                  />
                )}
                {tab === "release" && (
                  <ScanToReleaseBin
                    ref={scanToReleaseRef}
                    currentStep={releaseCurrentStep}
                    onStepChange={setReleaseCurrentStep}
                  />
                )}
                {tab === "warehouseReturn" && (
                  <ScanToWarehouseReturn
                    ref={scanToWarehouseReturnRef}
                    currentStep={warehouseReturnCurrentStep}
                    onStepChange={setWarehouseReturnCurrentStep}
                  />
                )}
                {tab === "scanComponentWeight" && <ScanComponentWeight />}
              </div>
            </div>
          </div>
        </div>

        {/* Image Preview Modal */}
        {modalImg && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="relative max-w-4xl max-h-full">
              <img
                src={modalImg}
                alt="Process Step Preview"
                className="max-w-full max-h-full rounded shadow-lg"
                onError={(e) => {
                  // If the image fails to load, show a placeholder
                  e.target.src = "https://placehold.co/400x300?text=Image+Not+Found";
                }}
              />
              <button
                onClick={() => setModalImg(null)}
                className="absolute top-4 right-4 bg-white text-black rounded-full w-10 h-10 flex items-center justify-center text-xl font-bold hover:bg-gray-200 transition-colors"
              >
                ×
              </button>
              <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-2 rounded text-sm">
                Click anywhere to close
              </div>
            </div>
            {/* Click outside to close */}
            <div
              className="absolute inset-0 -z-10"
              onClick={() => setModalImg(null)}
            ></div>
          </div>
        )}
      </div>
    </div>
  );
}