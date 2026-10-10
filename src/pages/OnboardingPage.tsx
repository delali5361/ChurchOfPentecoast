import { useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

interface FormState {
  orgName: string;
  orgSlug: string;
  branchName: string;
  email: string;
  password: string;
  confirmPassword: string;
  preferredName: string;
  phone: string;
  country: string;
  timezone: string;
  loading: boolean;
  error: string;
  success: string;
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<'org' | 'branch' | 'user'>('org');
  const [form, setForm] = useState<FormState>({
    orgName: '',
    orgSlug: '',
    branchName: '',
    email: '',
    password: '',
    confirmPassword: '',
    preferredName: '',
    phone: '',
    country: '',
    timezone: 'UTC',
    loading: false,
    error: '',
    success: '',
  });
  const [orgId, setOrgId] = useState<string>('');
  const [branchId, setBranchId] = useState<string>('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value, error: '' }));
  };

  const handleOrgSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setForm(prev => ({ ...prev, loading: true, error: '' }));

    try {
      if (!supabase) throw new Error('Supabase not initialized');

      const { data, error } = await supabase
        .from('organizations')
        .insert({
          name: form.orgName,
          slug: form.orgSlug.toLowerCase().replace(/\s+/g, '-'),
          country: form.country,
          timezone: form.timezone,
        })
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error('No organization returned');

      setOrgId(data.id);
      setForm(prev => ({ ...prev, success: 'Organization created successfully!' }));
      setTimeout(() => setStage('branch'), 1000);
    } catch (err) {
      setForm(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to create organization',
      }));
    } finally {
      setForm(prev => ({ ...prev, loading: false }));
    }
  };

  const handleBranchSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setForm(prev => ({ ...prev, loading: true, error: '' }));

    try {
      if (!supabase) throw new Error('Supabase not initialized');

      const { data, error } = await supabase
        .from('branches')
        .insert({
          organization_id: orgId,
          name: form.branchName,
          code: form.branchName.substring(0, 5).toUpperCase(),
          is_headquarters: true,
        })
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error('No branch returned');

      setBranchId(data.id);
      setForm(prev => ({ ...prev, success: 'Branch created successfully!' }));
      setTimeout(() => setStage('user'), 1000);
    } catch (err) {
      setForm(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to create branch',
      }));
    } finally {
      setForm(prev => ({ ...prev, loading: false }));
    }
  };

  const handleUserSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setForm(prev => ({ ...prev, loading: true, error: '' }));

    try {
      if (!supabase) throw new Error('Supabase not initialized');
      if (form.password !== form.confirmPassword) {
        throw new Error('Passwords do not match');
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('User creation failed');

      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          organization_id: orgId,
          preferred_name: form.preferredName,
          phone: form.phone,
        });

      if (profileError) throw profileError;

      const { data: roleData, error: roleError } = await supabase
        .from('app_roles')
        .select('id')
        .eq('code', 'super_administrator')
        .single();

      if (roleError) throw roleError;
      if (!roleData) throw new Error('System role not found');

      const { error: assignError } = await supabase
        .from('user_roles')
        .insert({
          user_id: authData.user.id,
          app_role_id: roleData.id,
          branch_id: branchId,
        });

      if (assignError) throw assignError;

      setForm(prev => ({ ...prev, success: 'Account created! Redirecting...' }));
      setTimeout(() => navigate('/overview'), 2000);
    } catch (err) {
      setForm(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to create account',
      }));
    } finally {
      setForm(prev => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="page-container full-height">
      <div className="onboarding-wrapper">
        <div className="onboarding-form">
          <div className="form-header">
            <Icon name="church" size="lg" />
            <h1>Church Management System Setup</h1>
            <p>Welcome! Let's set up your church's account.</p>
          </div>

          {form.error && <div className="toast error-toast">{form.error}</div>}
          {form.success && <div className="toast success-toast">{form.success}</div>}

          {stage === 'org' && (
            <form onSubmit={handleOrgSubmit}>
              <fieldset className="form-fieldset">
                <legend>Organization Information</legend>
                <div className="form-group">
                  <label htmlFor="orgName">Church Name *</label>
                  <input
                    id="orgName"
                    name="orgName"
                    type="text"
                    value={form.orgName}
                    onChange={handleChange}
                    placeholder="e.g., Grace Assembly Church"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="orgSlug">Church Slug *</label>
                  <input
                    id="orgSlug"
                    name="orgSlug"
                    type="text"
                    value={form.orgSlug}
                    onChange={handleChange}
                    placeholder="e.g., grace-assembly"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="country">Country</label>
                  <input
                    id="country"
                    name="country"
                    type="text"
                    value={form.country}
                    onChange={handleChange}
                    placeholder="e.g., United States"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="timezone">Timezone *</label>
                  <select
                    id="timezone"
                    name="timezone"
                    value={form.timezone}
                    onChange={handleChange}
                    required
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">EST / EDT</option>
                    <option value="America/Chicago">CST / CDT</option>
                    <option value="America/Denver">MST / MDT</option>
                    <option value="America/Los_Angeles">PST / PDT</option>
                    <option value="Europe/London">GMT / BST</option>
                    <option value="Europe/Paris">CET / CEST</option>
                    <option value="Asia/Tokyo">JST</option>
                    <option value="Australia/Sydney">AEDT</option>
                  </select>
                </div>
              </fieldset>
              <button type="submit" className="btn btn-primary" disabled={form.loading}>
                {form.loading ? 'Creating...' : 'Create Organization'}
              </button>
            </form>
          )}

          {stage === 'branch' && (
            <form onSubmit={handleBranchSubmit}>
              <fieldset className="form-fieldset">
                <legend>Headquarters Branch</legend>
                <div className="form-group">
                  <label htmlFor="branchName">Branch Name *</label>
                  <input
                    id="branchName"
                    name="branchName"
                    type="text"
                    value={form.branchName}
                    onChange={handleChange}
                    placeholder="e.g., Main Campus"
                    required
                  />
                </div>
              </fieldset>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setStage('org')}>
                  Back
                </button>
                <button type="submit" className="btn btn-primary" disabled={form.loading}>
                  {form.loading ? 'Creating...' : 'Create Branch'}
                </button>
              </div>
            </form>
          )}

          {stage === 'user' && (
            <form onSubmit={handleUserSubmit}>
              <fieldset className="form-fieldset">
                <legend>Administrator Account</legend>
                <div className="form-group">
                  <label htmlFor="preferredName">Your Name</label>
                  <input
                    id="preferredName"
                    name="preferredName"
                    type="text"
                    value={form.preferredName}
                    onChange={handleChange}
                    placeholder="e.g., John Doe"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email *</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="admin@church.com"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="password">Password *</label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm Password *</label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    placeholder="••••••••"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="phone">Phone</label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </fieldset>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setStage('branch')}>
                  Back
                </button>
                <button type="submit" className="btn btn-primary" disabled={form.loading}>
                  {form.loading ? 'Creating Account...' : 'Create Account'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <style>{`
        .onboarding-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 2rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .onboarding-form {
          width: 100%;
          max-width: 500px;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border-radius: 16px;
          padding: 2rem;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .form-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .form-header h1 {
          font-size: 1.75rem;
          font-weight: 600;
          color: #1a202c;
          margin-top: 1rem;
        }

        .form-header p {
          color: #718096;
          font-size: 0.95rem;
          margin-top: 0.5rem;
        }

        .form-fieldset {
          border: none;
          padding: 0;
          margin-bottom: 1.5rem;
        }

        .form-fieldset legend {
          font-size: 1.1rem;
          font-weight: 600;
          color: #2d3748;
          margin-bottom: 1rem;
          padding: 0;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-group label {
          display: block;
          font-size: 0.9rem;
          font-weight: 500;
          color: #2d3748;
          margin-bottom: 0.5rem;
        }

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 0.75rem;
          font-size: 1rem;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          transition: all 0.2s;
          font-family: inherit;
        }

        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .form-actions {
          display: flex;
          gap: 1rem;
          margin-top: 2rem;
        }

        .btn {
          flex: 1;
          padding: 0.75rem;
          font-size: 1rem;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }

        .btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: #e2e8f0;
          color: #2d3748;
        }

        .btn-secondary:hover {
          background: #cbd5e0;
        }

        .toast {
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
          font-size: 0.95rem;
          font-weight: 500;
        }

        .error-toast {
          background: #fed7d7;
          color: #c53030;
          border: 1px solid #fc8181;
        }

        .success-toast {
          background: #c6f6d5;
          color: #22543d;
          border: 1px solid #9ae6b4;
        }

        @media (max-width: 580px) {
          .onboarding-wrapper {
            padding: 1rem;
          }

          .onboarding-form {
            padding: 1.5rem;
          }

          .form-header h1 {
            font-size: 1.5rem;
          }

          .form-actions {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
