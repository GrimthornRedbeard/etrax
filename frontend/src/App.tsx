import { Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';

import { Layout } from './components/layout/Layout';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

// Lazy load pages for better performance
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Equipment = lazy(() => import('./pages/Equipment'));
const EquipmentDetail = lazy(() => import('./pages/EquipmentDetail'));
const AddEquipment = lazy(() => import('./pages/AddEquipment'));
const Scan = lazy(() => import('./pages/Scan'));
const Voice = lazy(() => import('./pages/Voice'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const NotFound = lazy(() => import('./pages/NotFound'));

const AppRoutes = () => (
  <Suspense fallback={<LoadingSpinner />}>
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      
      {/* Protected routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/equipment" element={<Equipment />} />
                <Route path="/equipment/:id" element={<EquipmentDetail />} />
                <Route path="/equipment/add" element={<AddEquipment />} />
                <Route path="/scan" element={<Scan />} />
                <Route path="/voice" element={<Voice />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  </Suspense>
);

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AppRoutes />
    </div>
  );
}

export default App;