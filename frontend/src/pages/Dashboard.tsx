import React, { useState, useEffect } from 'react';

interface DashboardStats {
  totalEquipment: number;
  available: number;
  checkedOut: number;
  maintenance: number;
  recentActivity: Array<{
    id: string;
    equipmentName: string;
    action: string;
    userName: string;
    timestamp: string;
  }>;
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/dashboard/stats', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome to ETrax - Sports Equipment Inventory Management
        </p>
      </div>
      
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-semibold">T</span>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Total Equipment</dt>
                <dd className="text-lg font-medium text-gray-900">{stats?.totalEquipment || 0}</dd>
              </dl>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-semibold">A</span>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Available</dt>
                <dd className="text-lg font-medium text-gray-900">{stats?.available || 0}</dd>
              </dl>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-semibold">O</span>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Checked Out</dt>
                <dd className="text-lg font-medium text-gray-900">{stats?.checkedOut || 0}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-semibold">M</span>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Maintenance</dt>
                <dd className="text-lg font-medium text-gray-900">{stats?.maintenance || 0}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <a
              href="/app/equipment"
              className="flex items-center p-3 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 bg-blue-100 rounded-md flex items-center justify-center mr-3">
                <span className="text-blue-600 text-lg">📦</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Manage Equipment</p>
                <p className="text-sm text-gray-500">View, add, and manage inventory</p>
              </div>
            </a>
            
            <button className="flex items-center p-3 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors w-full text-left">
              <div className="w-10 h-10 bg-green-100 rounded-md flex items-center justify-center mr-3">
                <span className="text-green-600 text-lg">📱</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">QR Scanner</p>
                <p className="text-sm text-gray-500">Quick check-in and check-out</p>
              </div>
            </button>
            
            <a
              href="/app/admin/auth"
              className="flex items-center p-3 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 bg-purple-100 rounded-md flex items-center justify-center mr-3">
                <span className="text-purple-600 text-lg">⚙️</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Admin Panel</p>
                <p className="text-sm text-gray-500">Configure OAuth2 and SAML SSO</p>
              </div>
            </a>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {stats?.recentActivity && stats.recentActivity.length > 0 ? (
              stats.recentActivity.slice(0, 5).map((activity) => (
                <div key={activity.id} className="flex items-start space-x-3">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    activity.action === 'CHECKED_OUT' ? 'bg-yellow-400' :
                    activity.action === 'CHECKED_IN' ? 'bg-green-400' :
                    activity.action === 'MAINTENANCE' ? 'bg-red-400' :
                    'bg-blue-400'
                  }`}></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {activity.equipmentName}
                    </p>
                    <p className="text-sm text-gray-500">
                      {activity.action.toLowerCase().replace('_', ' ')} by {activity.userName}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(activity.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No recent activity</p>
            )}
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Getting Started</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">📱</span>
            </div>
            <h4 className="text-sm font-semibold text-gray-900">QR Code Scanning</h4>
            <p className="text-xs text-gray-500 mt-1">Quick equipment check-in and check-out</p>
          </div>
          
          <div className="text-center">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">📊</span>
            </div>
            <h4 className="text-sm font-semibold text-gray-900">Real-time Tracking</h4>
            <p className="text-xs text-gray-500 mt-1">Monitor equipment status and location</p>
          </div>
          
          <div className="text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">🔒</span>
            </div>
            <h4 className="text-sm font-semibold text-gray-900">Enterprise Security</h4>
            <p className="text-xs text-gray-500 mt-1">OAuth2 and SAML SSO integration</p>
          </div>
          
          <div className="text-center">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">🎤</span>
            </div>
            <h4 className="text-sm font-semibold text-gray-900">Voice Commands</h4>
            <p className="text-xs text-gray-500 mt-1">Hands-free equipment management</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;