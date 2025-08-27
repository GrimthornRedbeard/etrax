import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import EquipmentForm from '../components/EquipmentForm';

interface Equipment {
  id: string;
  name: string;
  category: string;
  serialNumber: string;
  qrCode: string;
  status: 'AVAILABLE' | 'CHECKED_OUT' | 'MAINTENANCE';
  location: string;
  condition: string;
  checkedOutTo?: string;
  checkedOutDate?: string;
  dueDate?: string;
  notes: string;
}

const Equipment: React.FC = () => {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [showQRModal, setShowQRModal] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [qrCodeUrl, setQRCodeUrl] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  useEffect(() => {
    fetchEquipment();
  }, []);

  const fetchEquipment = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/equipment', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setEquipment(data.equipment);
      }
    } catch (error) {
      console.error('Failed to fetch equipment:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async (equipmentId: string, equipmentName: string) => {
    const userName = prompt(`Check out "${equipmentName}" to:`);
    if (!userName) return;

    const dueDate = prompt('Due date (YYYY-MM-DD):') || undefined;
    const notes = prompt('Notes (optional):') || undefined;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/equipment/${equipmentId}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userName,
          dueDate,
          notes,
        }),
      });

      if (response.ok) {
        fetchEquipment();
      } else {
        alert('Failed to check out equipment');
      }
    } catch (error) {
      alert('Error checking out equipment');
    }
  };

  const handleCheckIn = async (equipmentId: string, equipmentName: string) => {
    const condition = prompt(`Check in "${equipmentName}" - Equipment condition:`, 'GOOD');
    if (!condition) return;

    const notes = prompt('Notes (optional):') || undefined;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/equipment/${equipmentId}/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          condition,
          notes,
        }),
      });

      if (response.ok) {
        fetchEquipment();
      } else {
        alert('Failed to check in equipment');
      }
    } catch (error) {
      alert('Error checking in equipment');
    }
  };

  const filteredEquipment = equipment.filter(item => {
    const matchesFilter = filter === 'ALL' || item.status === filter;
    const matchesSearch = search === '' || 
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.serialNumber.toLowerCase().includes(search.toLowerCase()) ||
      item.qrCode.toLowerCase().includes(search.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  const generateQRCode = async (equipment: Equipment) => {
    try {
      const qrData = JSON.stringify({
        id: equipment.id,
        name: equipment.name,
        serialNumber: equipment.serialNumber,
        qrCode: equipment.qrCode
      });
      
      const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      setQRCodeUrl(qrCodeDataUrl);
      setSelectedEquipment(equipment);
      setShowQRModal(true);
    } catch (error) {
      console.error('Error generating QR code:', error);
      alert('Failed to generate QR code');
    }
  };

  const downloadQRCode = () => {
    if (!selectedEquipment || !qrCodeUrl) return;
    
    const link = document.createElement('a');
    link.download = `QR-${selectedEquipment.qrCode}.png`;
    link.href = qrCodeUrl;
    link.click();
  };

  const handleSaveEquipment = (equipmentData: Equipment) => {
    setShowAddForm(false);
    setShowEditForm(false);
    setSelectedEquipment(null);
    fetchEquipment(); // Refresh the list
  };

  const handleEditEquipment = (equipment: Equipment) => {
    setSelectedEquipment(equipment);
    setShowEditForm(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE': return 'bg-green-100 text-green-800';
      case 'CHECKED_OUT': return 'bg-yellow-100 text-yellow-800';
      case 'MAINTENANCE': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <div className="p-6">Loading equipment...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Equipment Management</h1>
        <button 
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Add Equipment
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search equipment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-3 py-2 rounded-md text-sm ${
                filter === 'ALL' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              All ({equipment.length})
            </button>
            <button
              onClick={() => setFilter('AVAILABLE')}
              className={`px-3 py-2 rounded-md text-sm ${
                filter === 'AVAILABLE' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Available ({equipment.filter(e => e.status === 'AVAILABLE').length})
            </button>
            <button
              onClick={() => setFilter('CHECKED_OUT')}
              className={`px-3 py-2 rounded-md text-sm ${
                filter === 'CHECKED_OUT' ? 'bg-yellow-600 text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Checked Out ({equipment.filter(e => e.status === 'CHECKED_OUT').length})
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredEquipment.map((item) => (
          <div key={item.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-gray-900 truncate">{item.name}</h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                  {item.status.replace('_', ' ')}
                </span>
              </div>
              
              <div className="space-y-2 text-sm text-gray-600 mb-4">
                <div><strong>Category:</strong> {item.category}</div>
                <div><strong>Serial:</strong> {item.serialNumber}</div>
                <div><strong>Location:</strong> {item.location}</div>
                {item.checkedOutTo && (
                  <div><strong>Checked out to:</strong> {item.checkedOutTo}</div>
                )}
                {item.dueDate && (
                  <div><strong>Due:</strong> {new Date(item.dueDate).toLocaleDateString()}</div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex gap-2">
                  {item.status === 'AVAILABLE' ? (
                    <button
                      onClick={() => handleCheckOut(item.id, item.name)}
                      className="flex-1 px-3 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-sm"
                    >
                      Check Out
                    </button>
                  ) : item.status === 'CHECKED_OUT' ? (
                    <button
                      onClick={() => handleCheckIn(item.id, item.name)}
                      className="flex-1 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                    >
                      Check In
                    </button>
                  ) : (
                    <button
                      disabled
                      className="flex-1 px-3 py-2 bg-gray-300 text-gray-500 rounded-md cursor-not-allowed text-sm"
                    >
                      In Maintenance
                    </button>
                  )}
                  
                  <button 
                    onClick={() => generateQRCode(item)}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  >
                    QR Code
                  </button>
                </div>
                
                <button
                  onClick={() => handleEditEquipment(item)}
                  className="w-full px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
                >
                  Edit Equipment
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredEquipment.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">No equipment found matching your criteria.</p>
        </div>
      )}

      {/* QR Code Modal */}
      {showQRModal && selectedEquipment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">QR Code</h3>
              <button 
                onClick={() => setShowQRModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            
            <div className="text-center">
              <div className="mb-4">
                <h4 className="font-medium text-gray-900">{selectedEquipment.name}</h4>
                <p className="text-sm text-gray-600">Serial: {selectedEquipment.serialNumber}</p>
                <p className="text-sm text-gray-600">Code: {selectedEquipment.qrCode}</p>
              </div>
              
              {qrCodeUrl && (
                <div className="mb-4">
                  <img 
                    src={qrCodeUrl} 
                    alt="QR Code" 
                    className="mx-auto border rounded"
                  />
                </div>
              )}
              
              <div className="flex gap-2 justify-center">
                <button
                  onClick={downloadQRCode}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Download PNG
                </button>
                <button
                  onClick={() => setShowQRModal(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Equipment Form Modals */}
      {showAddForm && (
        <EquipmentForm
          onSave={handleSaveEquipment}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {showEditForm && selectedEquipment && (
        <EquipmentForm
          equipment={selectedEquipment}
          onSave={handleSaveEquipment}
          onCancel={() => {
            setShowEditForm(false);
            setSelectedEquipment(null);
          }}
        />
      )}
    </div>
  );
};

export default Equipment;