import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';

// Centralized status configuration
const STATUS_CONFIG = {
    'Ready for Release': {
        zone: 'ready',
        color: 'bg-emerald-500 hover:bg-emerald-600',
        icon: '✅',
        priority: 1
    },
    'Pending JTC': {
        zone: 'pending',
        color: 'bg-blue-500 hover:bg-blue-600',
        icon: '⏳',
        priority: 2
    },
    'Pending Refill': {
        zone: 'refill',
        color: 'bg-orange-500 hover:bg-orange-600',
        icon: '🔄',
        priority: 3
    },
    'Returned to Warehouse': {
        zone: 'empty',
        color: 'bg-gray-400 hover:bg-gray-500',
        icon: '📦',
        priority: 4
    },
    'Pending': {
        zone: 'empty',
        color: 'bg-gray-400 hover:bg-gray-500',
        icon: '📦',
        priority: 5
    },
    'pending': {
        zone: 'empty',
        color: 'bg-gray-400 hover:bg-gray-500',
        icon: '📦',
        priority: 5
    },
    'Released': {
        zone: 'production',
        color: 'bg-orange-500 hover:bg-orange-600',
        icon: '⚙️',
        priority: 6
    },
    'Damaged': {
        zone: 'damaged',
        color: 'bg-red-500 hover:bg-red-600',
        icon: '🛑',
        priority: 7
    },
    'Missing': {
        zone: 'missing',
        color: 'bg-yellow-500 hover:bg-yellow-600',
        icon: '❓',
        priority: 8
    },
};

// Zone configuration for production workcells
const ZONE_CONFIG = {
    'A': { name: 'Zone A', icon: '🅰️', color: 'bg-blue-100' },
    'B': { name: 'Zone B', icon: '🅱️', color: 'bg-green-100' },
    'C': { name: 'Zone C', icon: '🅲', color: 'bg-yellow-100' },
    'D': { name: 'Zone D', icon: '🅳', color: 'bg-purple-100' },
    'E': { name: 'Zone E', icon: '🅴', color: 'bg-red-100' },
    'F': { name: 'Zone F', icon: '🅵', color: 'bg-indigo-100' },
    'G': { name: 'Zone G', icon: '🅶', color: 'bg-pink-100' },
    'H': { name: 'Zone H', icon: '🅷', color: 'bg-gray-100' },
    'I': { name: 'Zone I', icon: '🅸', color: 'bg-orange-100' },
    'J': { name: 'Zone J', icon: '🅹', color: 'bg-teal-100' },
};

// Loading skeleton component
const BinSkeleton = () => (
    <div className="w-16 h-16 bg-gray-200 rounded animate-pulse"></div>
);

// Bin Info Modal Component
const BinInfoModal = ({ bin, isOpen, onClose, onStatusChange }) => {
    const [components, setComponents] = useState([]);
    const [binInfo, setBinInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen && bin) {
            fetchBinInfo();
        }
    }, [isOpen, bin]);

    const fetchBinInfo = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await axios.get(`/api/bin-info/${bin.bin_id}`);


            if (response.data.success) {
                console.log(response.data);
                setBinInfo(response.data.bin);
                setComponents(response.data.components || []);
            } else {
                setError('Failed to load bin information');
            }
        } catch (err) {
            console.error('Error fetching bin info:', err);
            setError('Error loading bin information');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusUpdate = async (newStatus) => {
        try {
            await axios.post(`/api/bins/${bin.bin_id}/status`, { status: newStatus });

            // Call the callback to refresh the main list
            if (onStatusChange) {
                onStatusChange();
            }

            // Close the modal
            onClose();
        } catch (error) {
            console.error('Error updating bin status:', error);
            // Optionally show an error message to the user
            setError('Failed to update bin status');
        }
    };

    if (!isOpen || !bin) return null;

    const config = STATUS_CONFIG[bin.status] || {
        color: 'bg-gray-400',
        icon: '❓'
    };

    const getDiscrepancyColor = (type) => {
        switch (type) {
            case 'OK': return 'bg-green-100 text-green-600';
            case 'Shortage': return 'bg-red-100 text-red-600';
            case 'Excess': return 'bg-yellow-100 text-yellow-600';
            default: return 'bg-gray-100 text-gray-600';
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">{config.icon}</span>
                            <div>
                                <h2 className="text-2xl font-bold">Bin {bin.bin_id}</h2>
                                <p className="text-blue-100">{bin.status}</p>
                                {bin.zone && <p className="text-blue-200 text-sm">Zone: {bin.zone}</p>}
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-white hover:bg-opacity-20 transition-colors"
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                    {loading ? (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                            <p className="text-gray-500">Loading bin information...</p>
                        </div>
                    ) : error ? (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                            <p className="text-red-600 mb-2">{error}</p>
                            <button
                                onClick={fetchBinInfo}
                                className="text-red-500 hover:text-red-600 text-sm"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Bin Details */}
                            {binInfo && (
                                <div className="mb-6">
                                    <h3 className="text-lg font-bold text-gray-800 mb-4">Bin Information</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="bg-gray-50 p-4 rounded-lg">
                                            <h4 className="font-semibold text-gray-700 mb-2">Location</h4>
                                            <p className="text-gray-900">{binInfo.location || 'Warehouse'}</p>
                                        </div>
                                        <div className="bg-gray-50 p-4 rounded-lg">
                                            <h4 className="font-semibold text-gray-700 mb-2">Status</h4>
                                            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-white text-sm ${config.color.split(' ')[0]}`}>
                                                {config.icon} {binInfo.status}
                                            </span>
                                        </div>
                                        {binInfo.zone && (
                                            <div className="bg-gray-50 p-4 rounded-lg">
                                                <h4 className="font-semibold text-gray-700 mb-2">Zone</h4>
                                                <p className="text-gray-900">{binInfo.zone}</p>
                                            </div>
                                        )}
                                        <div className="bg-gray-50 p-4 rounded-lg">
                                            <h4 className="font-semibold text-gray-700 mb-2">JTC</h4>
                                            <p className="text-gray-900">{binInfo.jtc || 'Not Assigned'}</p>
                                        </div>
                                        {binInfo.wc_id && (
                                            <div className="bg-gray-50 p-4 rounded-lg">
                                                <h4 className="font-semibold text-gray-700 mb-2">Workcell</h4>
                                                <p className="text-gray-900">{binInfo.wc_id}</p>
                                            </div>
                                        )}
                                        {binInfo.last_updated && (
                                            <div className="bg-gray-50 p-4 rounded-lg">
                                                <h4 className="font-semibold text-gray-700 mb-2">Last Updated</h4>
                                                <p className="text-gray-900 text-sm">{new Date(binInfo.last_updated).toLocaleString()}</p>
                                            </div>
                                        )}
                                        {binInfo.last_used && (
                                            <div className="bg-gray-50 p-4 rounded-lg">
                                                <h4 className="font-semibold text-gray-700 mb-2">Last Used</h4>
                                                <p className="text-gray-900 text-sm">{new Date(binInfo.last_used).toLocaleString()}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            {binInfo && binInfo.location !== 'production' && (
                                <div className="flex gap-4 mb-6">

                                    <button
                                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold"
                                        onClick={() => handleStatusUpdate('Returned to Warehouse')}
                                    >
                                        Mark as Returned
                                    </button>
                                    <button
                                        className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg font-semibold"
                                        onClick={() => handleStatusUpdate('Missing')}
                                    >
                                        Mark as Missing
                                    </button>
                                    <button
                                        className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-semibold"
                                        onClick={() => handleStatusUpdate('Damaged')}
                                    >
                                        Mark as Damaged
                                    </button>
                                </div>
                            )}

                            {/* Components Section */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                        📦 Components
                                        <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded-full text-sm">
                                            {components.length}
                                        </span>
                                    </h3>
                                    <button
                                        onClick={fetchBinInfo}
                                        className="text-blue-500 hover:text-blue-600 text-sm flex items-center gap-1"
                                        disabled={loading}
                                    >
                                        🔄 Refresh
                                    </button>
                                </div>

                                {components.length === 0 ? (
                                    <div className="bg-gray-50 rounded-lg p-8 text-center">
                                        <div className="text-gray-400 text-4xl mb-2">📭</div>
                                        <p className="text-gray-500">No components in this bin</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-sm border border-gray-200 rounded-lg">
                                            <thead>
                                                <tr className="bg-gray-100">
                                                    <th className="p-3 text-left border-b font-semibold">Component ID</th>
                                                    <th className="p-3 text-left border-b font-semibold">Name</th>
                                                    <th className="p-3 text-center border-b font-semibold">Actual Qty</th>
                                                    <th className="p-3 text-center border-b font-semibold">Expected Qty</th>
                                                    <th className="p-3 text-center border-b font-semibold">Actual Weight (kg)</th>
                                                    <th className="p-3 text-center border-b font-semibold">Unit Weight (g)</th>
                                                    <th className="p-3 text-center border-b font-semibold">Discrepancy</th>
                                                    <th className="p-3 text-center border-b font-semibold">Difference</th>
                                                    <th className="p-3 text-center border-b font-semibold">Scale Required</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {components.map((component, index) => (
                                                    <tr key={index} className="hover:bg-gray-50 border-b">
                                                        <td className="p-3 font-medium text-blue-600">{component.component_id}</td>
                                                        <td className="p-3">{component.component_name || '-'}</td>
                                                        <td className="p-3 text-center">{component.actual_quantity || 0}</td>
                                                        <td className="p-3 text-center">{component.expected_quantity_per_bin || 0}</td>
                                                        <td className="p-3 text-center">{component.actual_weight || '-'}</td>
                                                        <td className="p-3 text-center">{component.unit_weight_g || '-'}</td>
                                                        <td className="p-3 text-center">
                                                            {component.discrepancy_type ? (
                                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDiscrepancyColor(component.discrepancy_type)}`}>
                                                                    {component.discrepancy_type}
                                                                </span>
                                                            ) : '-'}
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            {component.difference !== null && component.difference !== undefined ? (
                                                                <span className={`font-medium ${component.difference > 0 ? 'text-yellow-600' :
                                                                    component.difference < 0 ? 'text-red-600' : 'text-green-600'
                                                                    }`}>
                                                                    {component.difference > 0 ? '+' : ''}{component.difference}
                                                                </span>
                                                            ) : '-'}
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${component.require_scale ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'
                                                                }`}>
                                                                {component.require_scale ? 'Yes' : 'No'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 flex justify-end">
                    <button
                        onClick={onClose}
                        className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

// Enhanced Bin Card Component
const BinCard = ({ bin, onClick }) => {
    const config = STATUS_CONFIG[bin.status] || {
        color: 'bg-gray-400 hover:bg-gray-500',
        icon: '❓'
    };

    return (
        <div
            className={`w-16 h-16 rounded-lg text-white font-semibold shadow-md 
                  flex flex-col items-center justify-center cursor-pointer 
                  transition-all duration-200 transform hover:scale-105 
                  hover:shadow-lg ${config.color}`}
            title={`Bin ${bin.bin_id}\nStatus: ${bin.status}\nLocation: ${bin.location || 'Warehouse'}${bin.zone ? `\nZone: ${bin.zone}` : ''}${bin.wc_id ? `\nWorkcell: ${bin.wc_id}` : ''}\nClick to view details`}
            onClick={() => onClick(bin)}
        >
            <span className="text-xs">{config.icon}</span>
            <span className="text-xs font-bold">{bin.bin_id}</span>
        </div>
    );
};

// Section Component
const Section = ({ title, icon, children, count = 0 }) => (
    <div className="bg-white shadow-lg rounded-xl p-6 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <span className="text-xl">{icon}</span>
                {title}
            </h3>
            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-medium">
                {count}
            </span>
        </div>
        {children}
    </div>
);

// Zone Component for Warehouse
const WarehouseZone = ({ title, icon, bins, color, onBinClick }) => {
    const [expanded, setExpanded] = useState(false);

    // Don't slice the bins here - let CSS handle the height restriction
    const displayBins = bins;

    return (
        <Section title={title} icon={icon} count={bins.length}>
            <div
                className={`grid grid-cols-4 gap-3 transition-all duration-300 ${!expanded && bins.length > 24 ? 'max-h-[450px] overflow-hidden' : ''
                    }`}
            >
                {displayBins.length === 0 ? (
                    <div className="col-span-4 text-gray-400 italic text-sm text-center py-4">
                        No bins in this zone
                    </div>
                ) : (
                    displayBins.map(bin => (
                        <BinCard key={bin.bin_id} bin={bin} onClick={onBinClick} />
                    ))
                )}
            </div>
            {bins.length > 24 && (
                <div className="text-center mt-3">
                    <button
                        className="text-blue-500 hover:text-blue-600 text-sm font-medium"
                        onClick={() => setExpanded(!expanded)}
                    >
                        {expanded ? 'Show Less' : `Show More (${bins.length - 24} more)`}
                    </button>
                </div>
            )}
        </Section>
    );
};

// Production Zone Component (for zones within a workcell)
const ProductionZone = ({ zone, bins, onBinClick }) => {
    const zoneConfig = ZONE_CONFIG[zone] || { name: `Zone ${zone}`, icon: '📍', color: 'bg-gray-100' };

    return (
        <div className={`${zoneConfig.color} rounded-lg p-4 border border-gray-200`}>
            <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                    <span>{zoneConfig.icon}</span>
                    {zoneConfig.name}
                </h4>
                <span className="bg-white bg-opacity-70 text-gray-700 px-2 py-1 rounded-full text-xs font-medium">
                    {bins.length}
                </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
                {bins.length === 0 ? (
                    <div className="col-span-4 text-gray-500 italic text-xs text-center py-2">
                        No bins
                    </div>
                ) : (
                    bins.map(bin => (
                        <BinCard key={bin.bin_id} bin={bin} onClick={onBinClick} />
                    ))
                )}
            </div>
        </div>
    );
};

// Workcell Component for Production (with zones)
const WorkcellZone = ({ workcell, bins, onBinClick }) => {
    // Group bins by zone within this workcell
    const zoneMap = useMemo(() => {
        const zones = {};
        bins.forEach(bin => {
            const zone = bin.zone || 'Unassigned';
            if (!zones[zone]) zones[zone] = [];
            zones[zone].push(bin);
        });

        // Sort bins within each zone
        Object.keys(zones).forEach(zone => {
            zones[zone].sort((a, b) => a.bin_id.localeCompare(b.bin_id));
        });

        return zones;
    }, [bins]);

    return (
        <Section
            title={`Workcell ${workcell} `}
            icon="⚙️"
            count={bins.length}
        >
            <div className="space-y-4">
                {Object.keys(zoneMap).length === 0 ? (
                    <div className="text-gray-400 italic text-sm text-center py-4">
                        No bins in this workcell
                    </div>
                ) : (
                    Object.entries(zoneMap)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([zone, zoneBins]) => (
                            <ProductionZone
                                key={zone}
                                zone={zone}
                                bins={zoneBins}
                                onBinClick={onBinClick}
                            />
                        ))
                )}
            </div>
        </Section>
    );
};

// Statistics Component
const Statistics = ({ totalBins, warehouseBins, productionBins }) => {
    const utilizationRate = totalBins > 0 ? ((productionBins.length / totalBins) * 100).toFixed(1) : 0;

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-lg shadow-md">
                <div className="text-2xl font-bold">{totalBins}</div>
                <div className="text-sm opacity-90">Total Bins</div>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg shadow-md">
                <div className="text-2xl font-bold">{warehouseBins.length}</div>
                <div className="text-sm opacity-90">In Warehouse</div>
            </div>
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 rounded-lg shadow-md">
                <div className="text-2xl font-bold">{productionBins.length}</div>
                <div className="text-sm opacity-90">In Production</div>
            </div>
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4 rounded-lg shadow-md">
                <div className="text-2xl font-bold">{utilizationRate}%</div>
                <div className="text-sm opacity-90">Utilization Rate</div>
            </div>
        </div>
    );
};

// Segmented Control Component
const SegmentedControl = ({ activeSection, setActiveSection }) => (
    <div className="flex justify-center mb-8">
        <div className="bg-gray-100 p-1 rounded-lg">
            <button
                className={`px-6 py-2 rounded-md font-semibold transition-all duration-200 ${activeSection === 'warehouse'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                    }`}
                onClick={() => setActiveSection('warehouse')}
            >
                🏪 Warehouse
            </button>
            <button
                className={`px-6 py-2 rounded-md font-semibold transition-all duration-200 ${activeSection === 'production'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                    }`}
                onClick={() => setActiveSection('production')}
            >
                ⚙️ Production
            </button>
        </div>
    </div>
);

// Main Component
export default function WarehouseBinMap() {
    const [bins, setBins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [selectedBin, setSelectedBin] = useState(null);
    const [showBinModal, setShowBinModal] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [activeSection, setActiveSection] = useState('warehouse');

    const isFirstLoad = useRef(true);

    // Enhanced search functionality
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResult, setSearchResult] = useState(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState(null);

    const handleStatusChange = () => {
        // Refresh the bins list when status changes
        fetchBins();
    };

    // Enhanced search handler that queries the backend
    const handleSearchInput = (e) => {
        setSearchTerm(e.target.value);
        setSearchResult(null);
        setSearchError(null);
    };

    const handleSearchSubmit = async (e) => {
        e.preventDefault();
        const binId = searchTerm.trim().toUpperCase();

        if (!binId) {
            setSearchResult(null);
            setSearchError(null);
            return;
        }

        try {
            setSearchLoading(true);
            setSearchError(null);

            const res = await axios.get(`/api/bin-info/${binId}`);

            if (res.data.success) {
                setSearchResult(res.data.bin);
                setSearchError(null);
            } else {
                setSearchResult(null);
                setSearchError('Bin not found');
            }
        } catch (err) {
            console.error('Search error:', err);
            setSearchResult(null);
            setSearchError('Bin not found or server error');
        } finally {
            setSearchLoading(false);
        }
    };

    // Auto-search on Enter key or when barcode scanner finishes
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSearchSubmit(e);
        }
    };

    // Clear search
    const clearSearch = () => {
        setSearchTerm('');
        setSearchResult(null);
        setSearchError(null);
    };

    // Open modal with searched bin
    const openSearchedBin = () => {
        if (searchResult) {
            setSelectedBin(searchResult);
            setShowBinModal(true);
        }
    };

    const fetchBins = useCallback(async () => {
        try {
            if (isFirstLoad.current) {
                setLoading(true);
            } else {
                setIsRefreshing(true);
            }

            const response = await axios.get('/api/bins');

            if (response.data.success) {
                setBins(response.data.bins);
                setLastUpdated(new Date());
                setError(null);
            } else {
                setError('Failed to load bins data');
            }
        } catch (err) {
            console.error('Error fetching bins:', err);
            setError('Error connecting to server');
        } finally {
            if (isFirstLoad.current) {
                setLoading(false);
                isFirstLoad.current = false;
            } else {
                setIsRefreshing(false);
            }
        }
    }, []);

    useEffect(() => {
        fetchBins();
        const interval = setInterval(fetchBins, 30000);
        return () => clearInterval(interval);
    }, [fetchBins]);

    // Restore scroll position after manual reload
    useEffect(() => {
        const savedScrollY = localStorage.getItem('warehouseScrollY');
        if (savedScrollY) {
            setTimeout(() => {
                window.scrollTo(0, parseInt(savedScrollY, 10));
                localStorage.removeItem('warehouseScrollY');
            }, 100);
        }
    }, []);

    // Memoized data processing
    const { totalBins, warehouseBins, productionBins, warehouseZones, workcellMap, readyByJtc } = useMemo(() => {
        const productionBins = bins.filter(bin => bin.location === 'production' || bin.status === 'Released');
        const warehouseBins = bins.filter(bin => !productionBins.some(pb => pb.bin_id === bin.bin_id));

        // Group warehouse bins by zone
        const zones = {
            ready: [],
            pending: [],
            refill: [],
            empty: [],
            damaged: [],
            missing: []
        };

        warehouseBins.forEach(bin => {
            const config = STATUS_CONFIG[bin.status];
            if (config && zones[config.zone]) {
                zones[config.zone].push(bin);
            }
        });

        // Sort bins within each zone by priority and bin_id
        Object.keys(zones).forEach(zone => {
            zones[zone].sort((a, b) => {
                const priorityA = STATUS_CONFIG[a.status]?.priority || 999;
                const priorityB = STATUS_CONFIG[b.status]?.priority || 999;
                if (priorityA !== priorityB) return priorityA - priorityB;
                return a.bin_id.localeCompare(b.bin_id);
            });
        });

        // Group production bins by workcell
        const workcells = {};
        productionBins.forEach(bin => {
            const workcell = bin.wc_id || 'Unassigned';
            if (!workcells[workcell]) workcells[workcell] = [];
            workcells[workcell].push(bin);
        });

        // Sort bins within each workcell
        Object.keys(workcells).forEach(workcell => {
            workcells[workcell].sort((a, b) => a.bin_id.localeCompare(b.bin_id));
        });

        // Group "Ready for Release" bins by JTC
        const readyByJtc = {};
        zones.ready.forEach(bin => {
            const jtc = bin.jtc || 'Unassigned';
            if (!readyByJtc[jtc]) readyByJtc[jtc] = [];
            readyByJtc[jtc].push(bin);
        });
        // Optional: sort JTC keys (Unassigned last)
        const readyByJtcEntries = Object.entries(readyByJtc).sort(([a], [b]) => {
            if (a === 'Unassigned') return 1;
            if (b === 'Unassigned') return -1;
            return a.localeCompare(b);
        });

        return {
            totalBins: bins.length,
            warehouseBins,
            productionBins,
            warehouseZones: zones,
            workcellMap: workcells,
            readyByJtc: readyByJtcEntries
        };
    }, [bins]);

    // Handle bin click
    const handleBinClick = (bin) => {
        setSelectedBin(bin);
        setShowBinModal(true);
    };

    // Close modal and clear search
    const closeBinModal = () => {
        setShowBinModal(false);
        setSelectedBin(null);
        // Optionally clear search when modal closes
        // clearSearch();
    };

    // Manual retry with scroll preservation
    const handleRetry = () => {
        localStorage.setItem('warehouseScrollY', window.scrollY.toString());
        window.location.reload();
    };

    // Loading state (only on first load)
    if (loading) {
        return (
            <div className="p-6 max-w-7xl mx-auto">
                <div className="text-center mb-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <h2 className="text-2xl font-bold text-gray-800">Loading Warehouse Data...</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="bg-white shadow-lg rounded-xl p-6">
                            <div className="h-6 bg-gray-200 rounded mb-4 animate-pulse"></div>
                            <div className="grid grid-cols-4 gap-3">
                                {[1, 2, 3, 4].map(j => <BinSkeleton key={j} />)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="p-6 max-w-7xl mx-auto">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                    <div className="text-red-500 text-4xl mb-4">⚠️</div>
                    <h2 className="text-xl font-bold text-red-800 mb-2">Error Loading Data</h2>
                    <p className="text-red-600 mb-4">{error}</p>
                    <button
                        onClick={handleRetry}
                        className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w mx-auto bg-gray-50 min-h-screen">
            {/* Statistics */}
            <Statistics
                totalBins={totalBins}
                warehouseBins={warehouseBins}
                productionBins={productionBins}
            />

            {/* Enhanced Search Bar */}
            <form onSubmit={handleSearchSubmit} className="flex justify-center mb-6">
                <div className="relative w-full max-w-md">
                    <input
                        type="text"
                        className="w-full px-4 py-3 pl-10 pr-10 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                        placeholder="Scan or enter Bin ID..."
                        value={searchTerm}
                        onChange={handleSearchInput}
                        onKeyDown={handleKeyDown}
                        autoFocus
                        disabled={searchLoading}
                    />
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        {searchLoading ? (
                            <div className="w-4 h-4 border border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <span className="text-gray-400">🔍</span>
                        )}
                    </div>
                    {searchTerm && !searchLoading && (
                        <button
                            type="button"
                            onClick={clearSearch}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </form>

            {/* Search Results */}
            {searchTerm && (
                <div className="mb-6">
                    {searchLoading ? (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-700 text-center max-w-md mx-auto">
                            <div className="flex items-center justify-center gap-2">
                                <div className="w-4 h-4 border border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                <span>Searching for bin "{searchTerm}"...</span>
                            </div>
                        </div>
                    ) : searchResult ? (
                        <div
                            className="bg-white border border-blue-200 rounded-lg p-4 flex items-center gap-4 cursor-pointer hover:bg-blue-50 transition shadow-sm max-w-md mx-auto"
                            onClick={openSearchedBin}
                        >
                            <span className="text-2xl">{STATUS_CONFIG[searchResult.status]?.icon || '❓'}</span>
                            <div className="flex-1">
                                <div className="font-bold text-blue-700">Bin {searchResult.bin_id}</div>
                                <div className="text-gray-600 text-sm">{searchResult.status}</div>
                                {searchResult.location && (
                                    <div className="text-gray-500 text-xs">Location: {searchResult.location}</div>
                                )}
                                {searchResult.wc_id && (
                                    <div className="text-gray-500 text-xs">Workcell: {searchResult.wc_id}</div>
                                )}
                                {searchResult.jtc && (
                                    <div className="text-gray-500 text-xs">JTC: {searchResult.jtc}</div>
                                )}
                            </div>
                            <span className="text-blue-500 text-sm font-medium">View Details →</span>
                        </div>
                    ) : searchError ? (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-center max-w-md mx-auto">
                            <span className="text-lg">❌</span>
                            <p className="mt-1">{searchError}</p>
                            <button
                                onClick={() => handleSearchSubmit({ preventDefault: () => { } })}
                                className="mt-2 text-red-600 hover:text-red-800 text-sm underline"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700 text-center max-w-md mx-auto">
                            <span className="text-lg">🔍</span>
                            <p className="mt-1">Press Enter to search for "{searchTerm}"</p>
                        </div>
                    )}
                </div>
            )}

            {/* Segmented Control */}
            <SegmentedControl
                activeSection={activeSection}
                setActiveSection={setActiveSection}
            />

            {/* Content based on active section */}
            {activeSection === 'warehouse' ? (
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                        🏪 Warehouse ({warehouseBins.length} bins)
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <Section title="Ready for Release" icon="✅" count={warehouseZones.ready.length}>
                            {readyByJtc.length === 0 ? (
                                <div className="text-gray-400 text-center py-8">No bins ready for release</div>
                            ) : (
                                readyByJtc.map(([jtc, bins]) => (
                                    <div key={jtc} className="mb-4">
                                        <div className="font-semibold text-blue-700 mb-2">
                                            {jtc === 'Unassigned' ? 'Unassigned JTC' : `JTC: ${jtc}`}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {bins.map(bin => (
                                                <BinCard
                                                    key={bin.bin_id}
                                                    bin={bin}
                                                    onClick={handleBinClick}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </Section>
                        <WarehouseZone
                            title="Pending JTC"
                            icon="⏳"
                            bins={warehouseZones.pending}
                            color="blue"
                            onBinClick={handleBinClick}
                        />
                        <WarehouseZone
                            title="Pending Refill"
                            icon="🔄"
                            bins={warehouseZones.refill}
                            color="orange"
                            onBinClick={handleBinClick}
                        />
                        <WarehouseZone
                            title="Empty/Returned"
                            icon="📦"
                            bins={warehouseZones.empty}
                            color="gray"
                            onBinClick={handleBinClick}
                        />
                        <WarehouseZone
                            title="Damaged"
                            icon="🛑"
                            bins={warehouseZones.damaged}
                            color="red"
                            onBinClick={handleBinClick}
                        />
                        <WarehouseZone
                            title="Missing"
                            icon="❓"
                            bins={warehouseZones.missing}
                            color="yellow"
                            onBinClick={handleBinClick}
                        />
                    </div>
                </div>
            ) : (
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2 justify-center">
                        ⚙️ Production ({productionBins.length} bins)
                    </h2>
                    {Object.keys(workcellMap).length === 0 ? (
                        <div className="bg-white shadow-lg rounded-xl p-8 text-center">
                            <div className="text-gray-400 text-4xl mb-4">🏭</div>
                            <h3 className="text-lg font-semibold text-gray-600 mb-2">No Production Activity</h3>
                            <p className="text-gray-500">No bins are currently in production workcells</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {Object.entries(workcellMap)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([workcell, bins]) => (
                                    <WorkcellZone
                                        key={workcell}
                                        workcell={workcell}
                                        bins={bins}
                                        onBinClick={handleBinClick}
                                    />
                                ))}
                        </div>
                    )}
                </div>
            )}

            {/* Footer */}
            <div className="text-center mt-12">
                <p className="text-gray-600">
                    Real-time bin tracking and status monitoring
                </p>
                {lastUpdated && (
                    <p className="text-sm text-gray-500 mt-2 flex items-center justify-center gap-2">
                        Last updated: {lastUpdated.toLocaleTimeString()}
                        {isRefreshing && (
                            <span className="inline-block w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                        )}
                    </p>
                )}
            </div>

            {/* Bin Info Modal */}
            <BinInfoModal
                bin={selectedBin}
                isOpen={showBinModal}
                onClose={closeBinModal}
                onStatusChange={handleStatusChange}
            />
        </div>
    );
}