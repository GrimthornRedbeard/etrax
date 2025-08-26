import React, { useState, useEffect } from 'react';

interface OAuth2Config {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface SAMLConfig {
  enabled: boolean;
  entityId: string;
  ssoUrl: string;
  certificate: string;
  nameIdFormat: string;
}

interface AuthConfig {
  oauth2: {
    google: OAuth2Config;
    microsoft: OAuth2Config;
    github: OAuth2Config;
  };
  saml: SAMLConfig;
}

const AuthConfig: React.FC = () => {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/auth/config', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
      }
    } catch (error) {
      console.error('Failed to fetch config:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateOAuth2Provider = async (provider: string, data: OAuth2Config) => {
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/auth/oauth2/${provider}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        setMessage(`${provider.charAt(0).toUpperCase() + provider.slice(1)} OAuth2 configuration updated successfully!`);
        fetchConfig();
      }
    } catch (error) {
      setMessage(`Failed to update ${provider} configuration`);
    } finally {
      setSaving(false);
    }
  };

  const updateSAMLConfig = async (data: SAMLConfig) => {
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/auth/saml', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        setMessage('SAML configuration updated successfully!');
        fetchConfig();
      }
    } catch (error) {
      setMessage('Failed to update SAML configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!config) {
    return <div className="p-6">Failed to load configuration</div>;
  }

  return (
    <div className="p-6 space-y-8">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Authentication Configuration</h1>
        
        {message && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded">
            {message}
          </div>
        )}

        {/* OAuth2 Providers */}
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">OAuth2 Providers</h2>
            
            {/* Google OAuth2 */}
            <OAuth2ProviderCard
              provider="google"
              title="Google OAuth2"
              config={config.oauth2.google}
              onUpdate={updateOAuth2Provider}
              saving={saving}
            />
            
            {/* Microsoft OAuth2 */}
            <OAuth2ProviderCard
              provider="microsoft"
              title="Microsoft OAuth2"
              config={config.oauth2.microsoft}
              onUpdate={updateOAuth2Provider}
              saving={saving}
            />
            
            {/* GitHub OAuth2 */}
            <OAuth2ProviderCard
              provider="github"
              title="GitHub OAuth2"
              config={config.oauth2.github}
              onUpdate={updateOAuth2Provider}
              saving={saving}
            />
          </div>

          {/* SAML Configuration */}
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">SAML SSO Configuration</h2>
            <SAMLConfigCard
              config={config.saml}
              onUpdate={updateSAMLConfig}
              saving={saving}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

interface OAuth2ProviderCardProps {
  provider: string;
  title: string;
  config: OAuth2Config;
  onUpdate: (provider: string, config: OAuth2Config) => void;
  saving: boolean;
}

const OAuth2ProviderCard: React.FC<OAuth2ProviderCardProps> = ({
  provider,
  title,
  config,
  onUpdate,
  saving,
}) => {
  const [formData, setFormData] = useState(config);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate(provider, formData);
  };

  return (
    <div className="border border-gray-200 rounded-lg p-6 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">{title}</h3>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={formData.enabled}
            onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="ml-2 text-sm text-gray-600">Enabled</span>
        </label>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client ID
            </label>
            <input
              type="text"
              value={formData.clientId}
              onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter client ID"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client Secret
            </label>
            <input
              type="password"
              value={formData.clientSecret}
              onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter client secret"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Redirect URI
          </label>
          <input
            type="url"
            value={formData.redirectUri}
            onChange={(e) => setFormData({ ...formData, redirectUri: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="https://your-domain.com/api/auth/callback/provider"
          />
        </div>
        
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </form>
    </div>
  );
};

interface SAMLConfigCardProps {
  config: SAMLConfig;
  onUpdate: (config: SAMLConfig) => void;
  saving: boolean;
}

const SAMLConfigCard: React.FC<SAMLConfigCardProps> = ({ config, onUpdate, saving }) => {
  const [formData, setFormData] = useState(config);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate(formData);
  };

  return (
    <div className="border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">SAML Single Sign-On</h3>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={formData.enabled}
            onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="ml-2 text-sm text-gray-600">Enabled</span>
        </label>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Entity ID
            </label>
            <input
              type="text"
              value={formData.entityId}
              onChange={(e) => setFormData({ ...formData, entityId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="urn:example:entity"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              SSO URL
            </label>
            <input
              type="url"
              value={formData.ssoUrl}
              onChange={(e) => setFormData({ ...formData, ssoUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://idp.example.com/sso"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            NameID Format
          </label>
          <select
            value={formData.nameIdFormat}
            onChange={(e) => setFormData({ ...formData, nameIdFormat: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">Email Address</option>
            <option value="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">Persistent</option>
            <option value="urn:oasis:names:tc:SAML:2.0:nameid-format:transient">Transient</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            X.509 Certificate
          </label>
          <textarea
            value={formData.certificate}
            onChange={(e) => setFormData({ ...formData, certificate: e.target.value })}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
          />
        </div>
        
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save SAML Configuration'}
        </button>
      </form>
    </div>
  );
};

export default AuthConfig;