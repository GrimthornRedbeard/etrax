import { Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';

// Simple components to avoid complex loading
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/auth/Login'));
const AuthConfig = lazy(() => import('./pages/admin/AuthConfig'));
const Equipment = lazy(() => import('./pages/Equipment'));

// Simple Protected Route component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('accessToken');
  if (!token) {
    return <Login />;
  }
  return <>{children}</>;
};

// Simple Layout component
const AppLayout = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">ETrax</h1>
            </div>
            <div className="flex items-center space-x-4">
              {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
                <a href="/app/admin/auth" className="text-blue-600 hover:text-blue-800">
                  Admin Panel
                </a>
              )}
              <span className="text-gray-700">Welcome, {user?.name || user?.email}</span>
              <button onClick={handleLogout} className="text-red-600 hover:text-red-800">
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/equipment" element={<Equipment />} />
          <Route path="/admin/auth" element={<AuthConfig />} />
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  );
};

const AppRoutes = () => (
  <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
    <Routes>
      {/* Root route for unauthenticated users */}
      <Route path="/" element={<Login />} />
      
      {/* Protected app routes */}
      <Route path="/app/*" element={<ProtectedRoute><AppLayout /></ProtectedRoute>} />
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