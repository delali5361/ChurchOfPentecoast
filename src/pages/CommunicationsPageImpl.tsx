import { useEffect, useState, useMemo } from 'react';
import { Icon } from '../components/Icon';
import { supabase } from '../supabase';
import { getCurrentOrganization } from '../data/workspace';
import type { PageId } from '../types';

interface CommunicationTemplate {
  id: string;
  name: string;
  channel: 'email' | 'sms' | 'push';
  subject: string;
  body: string;
  status: 'active' | 'archived';
  created_at: string;
}

interface CommunicationCampaign {
  id: string;
  name: string;
  channel: 'email' | 'sms' | 'push';
  audience: string;
  message: string;
  status: 'draft' | 'scheduled' | 'sent' | 'archived';
  scheduled_for: string | null;
  sent_count: number;
  created_at: string;
}

interface AudienceOption {
  id: string;
  label: string;
  description: string;
  icon: string;
}

const audiences: AudienceOption[] = [
  { id: 'all-members', label: 'All members', description: 'Reach every confirmed member', icon: 'users' },
  { id: 'campus', label: 'Campus', description: 'Target a specific branch or campus', icon: 'house' },
  { id: 'ministry', label: 'Ministry', description: 'Reach people in a specific ministry', icon: 'network' },
  { id: 'group', label: 'Group', description: 'Connect with a small group', icon: 'users' },
  { id: 'selected', label: 'Selected members', description: 'Choose specific people', icon: 'contact' },
];

export function CommunicationsPageImpl({ onAction }: { onAction: (message: string) => void }) {
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<CommunicationCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'templates' | 'campaigns'>('overview');
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CommunicationTemplate | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<CommunicationCampaign | null>(null);

  // Template form state
  const [templateForm, setTemplateForm] = useState({ name: '', channel: 'email' as 'email' | 'sms' | 'push', subject: '', body: '' });
  const [templateError, setTemplateError] = useState('');

  // Campaign form state
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    channel: 'email' as 'email' | 'sms' | 'push',
    audience: '',
    message: '',
    scheduled_for: '',
  });
  const [campaignError, setCampaignError] = useState('');

  // Load organization and data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        if (supabase) {
          const organization = await getCurrentOrganization(supabase);
          if (organization) {
            setOrg(organization);
            await loadTemplates(organization.id);
            await loadCampaigns(organization.id);
          }
        }
      } catch (error) {
        onAction(`Error loading communications: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [onAction]);

  const loadTemplates = async (organizationId: string) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('communication_templates')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTemplates((data || []) as CommunicationTemplate[]);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  const loadCampaigns = async (organizationId: string) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('communication_campaigns')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCampaigns((data || []) as CommunicationCampaign[]);
    } catch (error) {
      console.error('Error loading campaigns:', error);
    }
  };

  const handleSaveTemplate = async () => {
    setTemplateError('');
    if (!templateForm.name.trim()) {
      setTemplateError('Template name is required');
      return;
    }
    if (!templateForm.body.trim()) {
      setTemplateError('Message body is required');
      return;
    }
    if (templateForm.channel === 'email' && !templateForm.subject.trim()) {
      setTemplateError('Subject is required for email templates');
      return;
    }

    if (!supabase || !org) return;

    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from('communication_templates')
          .update({
            name: templateForm.name,
            channel: templateForm.channel,
            subject: templateForm.subject,
            body: templateForm.body,
          })
          .eq('id', editingTemplate.id);
        if (error) throw error;
        onAction('Template updated successfully');
      } else {
        const { error } = await supabase
          .from('communication_templates')
          .insert({
            organization_id: org.id,
            name: templateForm.name,
            channel: templateForm.channel,
            subject: templateForm.subject,
            body: templateForm.body,
            status: 'active',
          });
        if (error) throw error;
        onAction('Template created successfully');
      }
      setShowTemplateForm(false);
      setEditingTemplate(null);
      setTemplateForm({ name: '', channel: 'email', subject: '', body: '' });
      await loadTemplates(org.id);
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : 'Could not save template');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!supabase) return;
    if (!confirm('Delete this template? This cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('communication_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
      onAction('Template deleted');
      if (org) await loadTemplates(org.id);
    } catch (error) {
      onAction(`Could not delete template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSaveCampaign = async () => {
    setCampaignError('');
    if (!campaignForm.name.trim()) {
      setCampaignError('Campaign name is required');
      return;
    }
    if (!campaignForm.audience) {
      setCampaignError('Audience is required');
      return;
    }
    if (!campaignForm.message.trim()) {
      setCampaignError('Message is required');
      return;
    }

    if (!supabase || !org) return;

    try {
      if (editingCampaign) {
        const { error } = await supabase
          .from('communication_campaigns')
          .update({
            name: campaignForm.name,
            channel: campaignForm.channel,
            audience: campaignForm.audience,
            message: campaignForm.message,
            scheduled_for: campaignForm.scheduled_for || null,
          })
          .eq('id', editingCampaign.id);
        if (error) throw error;
        onAction('Campaign updated successfully');
      } else {
        const { error } = await supabase
          .from('communication_campaigns')
          .insert({
            organization_id: org.id,
            name: campaignForm.name,
            channel: campaignForm.channel,
            audience: campaignForm.audience,
            message: campaignForm.message,
            status: 'draft',
            scheduled_for: campaignForm.scheduled_for || null,
          });
        if (error) throw error;
        onAction('Campaign created successfully');
      }
      setShowCampaignForm(false);
      setEditingCampaign(null);
      setCampaignForm({ name: '', channel: 'email', audience: '', message: '', scheduled_for: '' });
      await loadCampaigns(org.id);
    } catch (error) {
      setCampaignError(error instanceof Error ? error.message : 'Could not save campaign');
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!supabase) return;
    if (!confirm('Delete this campaign? This cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('communication_campaigns')
        .delete()
        .eq('id', id);
      if (error) throw error;
      onAction('Campaign deleted');
      if (org) await loadCampaigns(org.id);
    } catch (error) {
      onAction(`Could not delete campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const activeTemplateCount = templates.filter(t => t.status === 'active').length;
  const draftCampaignCount = campaigns.filter(c => c.status === 'draft').length;
  const sentCampaignCount = campaigns.filter(c => c.status === 'sent').length;
  const totalMessagesSent = campaigns.reduce((sum, c) => sum + c.sent_count, 0);

  if (loading) {
    return <div className="module-loading"><span className="loading-spinner" /><span>Loading communications</span></div>;
  }

  if (!org) {
    return <div className="module-error">Could not load organization. Please refresh the page.</div>;
  }

  return (
    <div className="communications-workspace">
      <div className="module-tabs">
        <button
          className={`module-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Icon name="dashboard" size={16} />
          Overview
        </button>
        <button
          className={`module-tab ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          <Icon name="file" size={16} />
          Templates
        </button>
        <button
          className={`module-tab ${activeTab === 'campaigns' ? 'active' : ''}`}
          onClick={() => setActiveTab('campaigns')}
        >
          <Icon name="messages" size={16} />
          Campaigns
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="communications-overview">
          <div className="overview-grid">
            <div className="overview-card">
              <div className="overview-card-header">
                <span className="overview-card-icon"><Icon name="file" size={20} /></span>
                <span className="overview-card-label">Templates</span>
              </div>
              <div className="overview-card-value">{activeTemplateCount}</div>
              <div className="overview-card-description">Active message templates</div>
            </div>

            <div className="overview-card">
              <div className="overview-card-header">
                <span className="overview-card-icon"><Icon name="edit" size={20} /></span>
                <span className="overview-card-label">Drafts</span>
              </div>
              <div className="overview-card-value">{draftCampaignCount}</div>
              <div className="overview-card-description">Campaigns ready to schedule</div>
            </div>

            <div className="overview-card">
              <div className="overview-card-header">
                <span className="overview-card-icon"><Icon name="send" size={20} /></span>
                <span className="overview-card-label">Sent</span>
              </div>
              <div className="overview-card-value">{sentCampaignCount}</div>
              <div className="overview-card-description">Campaigns delivered</div>
            </div>

            <div className="overview-card">
              <div className="overview-card-header">
                <span className="overview-card-icon"><Icon name="chart" size={20} /></span>
                <span className="overview-card-label">Reach</span>
              </div>
              <div className="overview-card-value">{totalMessagesSent.toLocaleString()}</div>
              <div className="overview-card-description">Total messages sent</div>
            </div>
          </div>

          <div className="overview-actions">
            <button className="action-button primary" onClick={() => { setEditingTemplate(null); setTemplateForm({ name: '', channel: 'email', subject: '', body: '' }); setShowTemplateForm(true); }}>
              <Icon name="plus" size={17} />
              Create template
            </button>
            <button className="action-button primary" onClick={() => { setEditingCampaign(null); setCampaignForm({ name: '', channel: 'email', audience: '', message: '', scheduled_for: '' }); setShowCampaignForm(true); }}>
              <Icon name="plus" size={17} />
              New campaign
            </button>
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="communications-section">
          <div className="section-header">
            <h3>Message Templates</h3>
            <button className="action-button" onClick={() => { setEditingTemplate(null); setTemplateForm({ name: '', channel: 'email', subject: '', body: '' }); setShowTemplateForm(true); }}>
              <Icon name="plus" size={16} />
              New template
            </button>
          </div>

          {showTemplateForm && (
            <div className="form-card">
              <h4>{editingTemplate ? 'Edit template' : 'Create a template'}</h4>
              {templateError && <div className="form-error">{templateError}</div>}
              <div className="form-group">
                <label>Template name</label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="e.g., Welcome new members"
                />
              </div>
              <div className="form-group">
                <label>Channel</label>
                <select value={templateForm.channel} onChange={(e) => setTemplateForm({ ...templateForm, channel: e.target.value as any })}>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="push">Push notification</option>
                </select>
              </div>
              {templateForm.channel === 'email' && (
                <div className="form-group">
                  <label>Subject line</label>
                  <input
                    type="text"
                    value={templateForm.subject}
                    onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                    placeholder="Email subject"
                  />
                </div>
              )}
              <div className="form-group">
                <label>Message body</label>
                <textarea
                  value={templateForm.body}
                  onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
                  placeholder="Type your message here. You can use {member_name}, {campus}, {date}, etc."
                  rows={6}
                />
              </div>
              <div className="form-actions">
                <button className="action-button secondary" onClick={() => setShowTemplateForm(false)}>Cancel</button>
                <button className="action-button primary" onClick={handleSaveTemplate}>Save template</button>
              </div>
            </div>
          )}

          <div className="templates-list">
            {templates.length === 0 ? (
              <div className="empty-state">
                <Icon name="file" size={32} />
                <p>No templates yet</p>
                <small>Create your first template to get started</small>
              </div>
            ) : (
              templates.map((template) => (
                <div key={template.id} className="template-card">
                  <div className="template-header">
                    <div>
                      <h4>{template.name}</h4>
                      <span className="badge">{template.channel}</span>
                    </div>
                    <div className="template-actions">
                      <button
                        className="icon-button"
                        onClick={() => {
                          setEditingTemplate(template);
                          setTemplateForm({
                            name: template.name,
                            channel: template.channel,
                            subject: template.subject,
                            body: template.body,
                          });
                          setShowTemplateForm(true);
                        }}
                        aria-label="Edit template"
                      >
                        <Icon name="edit" size={16} />
                      </button>
                      <button
                        className="icon-button danger"
                        onClick={() => handleDeleteTemplate(template.id)}
                        aria-label="Delete template"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                  {template.subject && (
                    <div className="template-preview">
                      <strong>Subject:</strong> {template.subject}
                    </div>
                  )}
                  <div className="template-preview">
                    {template.body.substring(0, 120)}
                    {template.body.length > 120 ? '…' : ''}
                  </div>
                  <div className="template-meta">
                    <small>Created {new Date(template.created_at).toLocaleDateString()}</small>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'campaigns' && (
        <div className="communications-section">
          <div className="section-header">
            <h3>Communication Campaigns</h3>
            <button className="action-button" onClick={() => { setEditingCampaign(null); setCampaignForm({ name: '', channel: 'email', audience: '', message: '', scheduled_for: '' }); setShowCampaignForm(true); }}>
              <Icon name="plus" size={16} />
              New campaign
            </button>
          </div>

          {showCampaignForm && (
            <div className="form-card">
              <h4>{editingCampaign ? 'Edit campaign' : 'Create a campaign'}</h4>
              {campaignError && <div className="form-error">{campaignError}</div>}
              <div className="form-group">
                <label>Campaign name</label>
                <input
                  type="text"
                  value={campaignForm.name}
                  onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                  placeholder="e.g., Sunday worship reminder"
                />
              </div>
              <div className="form-group">
                <label>Channel</label>
                <select value={campaignForm.channel} onChange={(e) => setCampaignForm({ ...campaignForm, channel: e.target.value as any })}>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="push">Push notification</option>
                </select>
              </div>
              <div className="form-group">
                <label>Audience</label>
                <select value={campaignForm.audience} onChange={(e) => setCampaignForm({ ...campaignForm, audience: e.target.value })}>
                  <option value="">Select an audience</option>
                  {audiences.map((aud) => (
                    <option key={aud.id} value={aud.id}>
                      {aud.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Message</label>
                <textarea
                  value={campaignForm.message}
                  onChange={(e) => setCampaignForm({ ...campaignForm, message: e.target.value })}
                  placeholder="Your message to the audience"
                  rows={5}
                />
              </div>
              <div className="form-group">
                <label>Schedule for (optional)</label>
                <input
                  type="datetime-local"
                  value={campaignForm.scheduled_for}
                  onChange={(e) => setCampaignForm({ ...campaignForm, scheduled_for: e.target.value })}
                />
              </div>
              <div className="form-actions">
                <button className="action-button secondary" onClick={() => setShowCampaignForm(false)}>Cancel</button>
                <button className="action-button primary" onClick={handleSaveCampaign}>Save campaign</button>
              </div>
            </div>
          )}

          <div className="campaigns-list">
            {campaigns.length === 0 ? (
              <div className="empty-state">
                <Icon name="messages" size={32} />
                <p>No campaigns yet</p>
                <small>Create your first campaign to start reaching your audience</small>
              </div>
            ) : (
              campaigns.map((campaign) => (
                <div key={campaign.id} className={`campaign-card status-${campaign.status}`}>
                  <div className="campaign-header">
                    <div>
                      <h4>{campaign.name}</h4>
                      <div className="campaign-meta">
                        <span className={`status-badge status-${campaign.status}`}>{campaign.status}</span>
                        <span className="badge">{campaign.channel}</span>
                      </div>
                    </div>
                    <div className="campaign-actions">
                      <button
                        className="icon-button"
                        onClick={() => {
                          setEditingCampaign(campaign);
                          setCampaignForm({
                            name: campaign.name,
                            channel: campaign.channel,
                            audience: campaign.audience,
                            message: campaign.message,
                            scheduled_for: campaign.scheduled_for || '',
                          });
                          setShowCampaignForm(true);
                        }}
                        aria-label="Edit campaign"
                      >
                        <Icon name="edit" size={16} />
                      </button>
                      <button
                        className="icon-button danger"
                        onClick={() => handleDeleteCampaign(campaign.id)}
                        aria-label="Delete campaign"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="campaign-audience">
                    <Icon name="users" size={15} />
                    <span>{audiences.find(a => a.id === campaign.audience)?.label || campaign.audience}</span>
                  </div>

                  <div className="campaign-preview">{campaign.message.substring(0, 120)}{campaign.message.length > 120 ? '…' : ''}</div>

                  <div className="campaign-footer">
                    {campaign.status === 'sent' && <span>{campaign.sent_count.toLocaleString()} messages sent</span>}
                    {campaign.scheduled_for && (
                      <span>
                        Scheduled for {new Date(campaign.scheduled_for).toLocaleDateString()} at{' '}
                        {new Date(campaign.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    <small>Created {new Date(campaign.created_at).toLocaleDateString()}</small>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
