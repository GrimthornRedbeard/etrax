import React from 'react';

const Login: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to ETrax
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Equipment Tracking System
          </p>
        </div>
        <div className="card p-8">
          <form className="space-y-6">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="input"
                placeholder="Email address"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="input"
                placeholder="Password"
              />
            </div>
            <div>
              <button type="submit" className="btn btn-primary w-full">
                Sign in
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;