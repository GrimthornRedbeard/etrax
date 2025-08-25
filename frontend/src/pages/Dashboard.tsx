import React from 'react';

const Dashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome to ETrax - Sports Equipment Inventory Management
        </p>
      </div>
      
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900">Total Equipment</h3>
          <p className="text-3xl font-bold text-primary-600 mt-2">0</p>
        </div>
        
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900">Available</h3>
          <p className="text-3xl font-bold text-success-600 mt-2">0</p>
        </div>
        
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900">In Use</h3>
          <p className="text-3xl font-bold text-warning-600 mt-2">0</p>
        </div>
      </div>
      
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Getting Started</h3>
        <div className="space-y-2">
          <p className="text-gray-600">
            • Add your first piece of equipment
          </p>
          <p className="text-gray-600">
            • Set up categories and locations
          </p>
          <p className="text-gray-600">
            • Generate QR codes for tracking
          </p>
          <p className="text-gray-600">
            • Use voice commands for quick updates
          </p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;