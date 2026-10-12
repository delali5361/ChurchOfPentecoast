import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { PageHeading } from '../components/PageHeading';
import { getCurrentOrganization, type WorkspaceOrganization } from '../data/workspace';
import { supabase } from '../supabase';

type FinanceTab = 'giving' | 'pledges' | 'expenses';
type FinanceDialog = FinanceTab | null;
type GivingRecord = {
  id: string;
  branch_id: string | null;
  member_id: string | null;
  pledge_id: string | null;
  donor_name: string | null;
  amount: number;
  category: string;
  payment_method: string;
  given_at: string;
  status: 'verified' | 'pending' | 'void';
};
type Pledge = {
  id: string;
  branch_id: string | null;
  member_id: string | null;
  donor_name: string;
  purpose: string;
  pledged_amount: number;
  start_date: string;
  due_date: string | null;
  status: 'active' | 'completed' | 'cancelled';
};
type Expense = {
  id: string;
  branch_id: string | null;
  amount: number;
  category: string;
  vendor: string | null;
  description: string;
  incurred_at: string;
  status: 'submitted' | 'approved' | 'rejected' | 'paid';
  created_by: string;
  paid_at: string | null;
  review_note: string | null;
};
type Person = { id: string; first_name: string; last_name: string; branch_id: string | null };
type FinancePermissions = { view: boolean; give: boolean; pledge: boolean; expense: boolean; approve: boolean };
type GivingForm = {
  member_id: string; donor_name: string; branch_id: string; pledge_id: string; amount: string;
  category: string; payment_method: string; given_at: string; notes: string;
};
type PledgeForm = {
  member_id: string; donor_name: string; branch_id: string; purpose: string; pledged_amount: string;
  start_date: string; due_date: string;
};
type ExpenseForm = {
  branch_id: string; amount: string; category: string; vendor: string; description: string; incurred_at: string;
};

const givingColumns = 'id,branch_id,member_id,pledge_id,donor_name,amount,category,payment_method,given_at,status';
const pledgeColumns = 'id,branch_id,member_id,donor_name,purpose,pledged_amount,start_date,due_date,status';
const expenseColumns = 'id,branch_id,amount,category,vendor,description,incurred_at,status,created_by,paid_at,review_note';
const today = new Date().toISOString().slice(0, 10);
const emptyGiving: GivingForm = {
  member_id: '', donor_name: '', branch_id: '', pledge_id: '', amount: '', category: 'tithe',
  payment_method: 'cash', given_at: today, notes: '',
};
const emptyPledge: PledgeForm = {
  member_id: '', donor_name: '', branch_id: '', purpose: '', pledged_amount: '',
  start_date: today, due_date: '',
};
const emptyExpense: ExpenseForm = {
  branch_id: '', amount: '', category: 'Operations', vendor: '', description: '', incurred_at: today,
};

function formatAmount(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return 'No due date';
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function FinancePage({ onAction }: { onAction: (message: string) => void }) {
  const [organization, setOrganization] = useState<WorkspaceOrganization | null>(null);
  const [giving, setGiving] = useState<GivingRecord[]>([]);
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [permissions, setPermissions] = useState<FinancePermissions>({
    view: false, give: false, pledge: false, expense: false, approve: false,
  });
  const [userId, setUserId] = useState('');
  const [tab, setTab] = useState<FinanceTab>('giving');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<FinanceDialog>(null);
  const [givingForm, setGivingForm] = useState<GivingForm>(emptyGiving);
  const [pledgeForm, setPledgeForm] = useState<PledgeForm>(emptyPledge);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(emptyExpense);
  const [reviewingId, setReviewingId] = useState('');

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const current = await getCurrentOrganization(supabase);
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(`Could not identify your signed-in account: ${authError.message}`);
      if (!authData.user) throw new Error('Sign in to access church finance.');
      const user_id = authData.user.id;
      setUserId(user_id);

      const { data: roleRows, error: roleError } = await supabase.from('user_roles')
        .select('app_role_id,app_roles(code)')
        .eq('user_id', user_id);
      if (roleError) throw new Error(`Could not load finance permissions: ${roleError.message}`);
      const roles = (roleRows ?? []) as unknown as { app_role_id: string; app_roles: { code: string } | null }[];
      const roleIds = roles.map((role) => role.app_role_id);
      let permissionCodes: string[] = [];
      if (roleIds.length) {
        const { data: permissionRows, error: permissionError } = await supabase.from('role_permissions')
          .select('app_permissions(code)')
          .in('app_role_id', roleIds);
        if (permissionError) throw new Error(`Could not load finance permissions: ${permissionError.message}`);
        permissionCodes = ((permissionRows ?? []) as unknown as { app_permissions: { code: string } | null }[])
          .flatMap((row) => row.app_permissions?.code ? [row.app_permissions.code] : []);
      }
      const isAdministrator = roles.some((role) => ['super_administrator', 'administrator'].includes(role.app_roles?.code ?? ''));
      const can = (code: string) => isAdministrator || permissionCodes.includes(code);
      setPermissions({
        view: can('finance.view'),
        give: can('finance.giving.create'),
        pledge: can('finance.pledge.create'),
        expense: can('finance.expense.create'),
        approve: can('finance.approve'),
      });
      setOrganization(current);
      if (!can('finance.view')) {
        setGiving([]);
        setPledges([]);
        setExpenses([]);
        setPeople([]);
        return;
      }

      const [givingResult, pledgeResult, expenseResult, peopleResult] = await Promise.all([
        supabase.from('giving_transactions').select(givingColumns).eq('organization_id', current.id).order('given_at', { ascending: false }),
        supabase.from('financial_pledges').select(pledgeColumns).eq('organization_id', current.id).order('created_at', { ascending: false }),
        supabase.from('financial_expenses').select(expenseColumns).eq('organization_id', current.id).order('incurred_at', { ascending: false }),
        supabase.from('members').select('id,first_name,last_name,branch_id').neq('membership_status', 'inactive').order('last_name'),
      ]);
      if (givingResult.error) throw new Error(`Could not load giving records: ${givingResult.error.message}`);
      if (pledgeResult.error) throw new Error(`Could not load pledges: ${pledgeResult.error.message}`);
      if (expenseResult.error) throw new Error(`Could not load expenses: ${expenseResult.error.message}`);
      if (peopleResult.error) throw new Error(`Could not load donor directory: ${peopleResult.error.message}`);
      setGiving((givingResult.data ?? []) as GivingRecord[]);
      setPledges((pledgeResult.data ?? []) as Pledge[]);
      setExpenses((expenseResult.data ?? []) as Expense[]);
      setPeople((peopleResult.data ?? []) as Person[]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load finance workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const month = new Date().toISOString().slice(0, 7);
  const verifiedGiving = giving.filter((record) => record.status === 'verified');
  const monthGiving = verifiedGiving.filter((record) => record.given_at.startsWith(month))
    .reduce((total, record) => total + Number(record.amount), 0);
  const paidThisMonth = expenses.filter((expense) => expense.status === 'paid' && expense.paid_at?.slice(0, 7) === month)
    .reduce((total, expense) => total + Number(expense.amount), 0);
  const outstandingCommitment = pledges.filter((pledge) => pledge.status === 'active')
    .reduce((total, pledge) => {
      const received = verifiedGiving.filter((record) => record.pledge_id === pledge.id)
        .reduce((sum, record) => sum + Number(record.amount), 0);
      return total + Math.max(0, Number(pledge.pledged_amount) - received);
    }, 0);
  const pendingApprovals = expenses.filter((expense) => expense.status === 'submitted').length;
  const branchName = (branchId: string | null) => organization?.branches.find((branch) => branch.id === branchId)?.name ?? 'All branches';

  const visibleGiving = useMemo(() => giving.filter((record) => {
    const query = search.trim().toLowerCase();
    return !query || [record.donor_name, record.category, record.payment_method, branchName(record.branch_id)]
      .some((value) => value?.toLowerCase().includes(query));
  }), [giving, search, organization]);
  const visiblePledges = useMemo(() => pledges.filter((pledge) => {
    const query = search.trim().toLowerCase();
    return !query || [pledge.donor_name, pledge.purpose, branchName(pledge.branch_id), pledge.status]
      .some((value) => value?.toLowerCase().includes(query));
  }), [pledges, search, organization]);
  const visibleExpenses = useMemo(() => expenses.filter((expense) => {
    const query = search.trim().toLowerCase();
    return !query || [expense.description, expense.category, expense.vendor, branchName(expense.branch_id), expense.status]
      .some((value) => value?.toLowerCase().includes(query));
  }), [expenses, search, organization]);

  const openForm = (formTab: Exclude<FinanceTab, 'expenses'> | 'expenses') => {
    setFormError('');
    if (formTab === 'giving') setGivingForm(emptyGiving);
    else if (formTab === 'pledges') setPledgeForm(emptyPledge);
    else setExpenseForm(emptyExpense);
    setDialog(formTab);
  };

  const submitGiving = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !organization) return;
    setSaving(true);
    setFormError('');
    const person = people.find((item) => item.id === givingForm.member_id);
    const donorName = person ? `${person.first_name} ${person.last_name}` : givingForm.donor_name.trim();
    const { error } = await supabase.from('giving_transactions').insert({
      organization_id: organization.id,
      branch_id: givingForm.branch_id || person?.branch_id || null,
      member_id: person?.id ?? null,
      pledge_id: givingForm.pledge_id || null,
      donor_name: donorName || null,
      amount: Number(givingForm.amount),
      category: givingForm.category,
      payment_method: givingForm.payment_method,
      given_at: givingForm.given_at,
      notes: givingForm.notes.trim() || null,
      status: 'verified',
    });
    if (error) { setFormError(`Could not record giving: ${error.message}`); setSaving(false); return; }
    setDialog(null);
    setSaving(false);
    onAction(`${formatAmount(Number(givingForm.amount))} giving record saved.`);
    await load();
  };

  const submitPledge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !organization) return;
    setSaving(true);
    setFormError('');
    const person = people.find((item) => item.id === pledgeForm.member_id);
    const { error } = await supabase.from('financial_pledges').insert({
      organization_id: organization.id,
      branch_id: pledgeForm.branch_id || person?.branch_id || null,
      member_id: person?.id ?? null,
      donor_name: person ? `${person.first_name} ${person.last_name}` : pledgeForm.donor_name.trim(),
      purpose: pledgeForm.purpose.trim(),
      pledged_amount: Number(pledgeForm.pledged_amount),
      start_date: pledgeForm.start_date,
      due_date: pledgeForm.due_date || null,
    });
    if (error) { setFormError(`Could not record pledge: ${error.message}`); setSaving(false); return; }
    setDialog(null);
    setSaving(false);
    onAction('Pledge recorded.');
    await load();
  };

  const submitExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !organization) return;
    setSaving(true);
    setFormError('');
    const { error } = await supabase.from('financial_expenses').insert({
      organization_id: organization.id,
      branch_id: expenseForm.branch_id || null,
      amount: Number(expenseForm.amount),
      category: expenseForm.category,
      vendor: expenseForm.vendor.trim() || null,
      description: expenseForm.description.trim(),
      incurred_at: expenseForm.incurred_at,
    });
    if (error) { setFormError(`Could not submit expense: ${error.message}`); setSaving(false); return; }
    setDialog(null);
    setSaving(false);
    onAction('Expense submitted for review.');
    await load();
  };

  const reviewExpense = async (expense: Expense, decision: 'approved' | 'rejected' | 'paid') => {
    if (!supabase) return;
    setReviewingId(expense.id);
    const { error } = await supabase.rpc('review_financial_expense', {
      target_expense_id: expense.id,
      requested_decision: decision,
      decision_note: null,
    });
    setReviewingId('');
    if (error) { onAction(`Could not update expense: ${error.message}`); return; }
    onAction(`Expense ${decision}.`);
    await load();
  };

  const currentCount = tab === 'giving' ? visibleGiving.length : tab === 'pledges' ? visiblePledges.length : visibleExpenses.length;

  return <>
    <PageHeading page="finance" />
    <section className="finance-workspace">
      <div className="finance-summary" aria-label="Financial summary">
        <article><span>Verified giving this month</span><strong>{formatAmount(monthGiving)}</strong><small>Organization currency units</small></article>
        <article><span>Paid expenses this month</span><strong>{formatAmount(paidThisMonth)}</strong><small>Based on payment date</small></article>
        <article><span>Open pledge balance</span><strong>{formatAmount(outstandingCommitment)}</strong><small>Active commitments only</small></article>
        <article><span>Awaiting review</span><strong>{pendingApprovals}</strong><small>Expense submissions</small></article>
      </div>

      {!supabase && <div className="people-notice" role="status"><Icon name="database" size={17} /><span>Preview only. Connect an authorized finance account to manage financial records.</span></div>}
      {supabase && !permissions.view && !loading && !loadError && <div className="people-error" role="alert">Your account does not have permission to view finance records. Ask an administrator for finance access.</div>}
      {loadError && <div className="people-error" role="alert">{loadError}<button className="text-button" onClick={() => void load()}>Retry</button></div>}

      <section className="finance-panel glass-card" aria-label="Finance records">
        <div className="people-directory-heading">
          <div><span className="eyebrow">Generosity & stewardship</span><h2>Financial records</h2><p>Handle gifts, commitments, and spending with a clear review trail.</p></div>
          {permissions.view && <div className="people-actions">
            {tab === 'giving' && <button className="button button-primary" type="button" disabled={!supabase || !permissions.give} onClick={() => openForm('giving')}><Icon name="plus" size={15} /> Record giving</button>}
            {tab === 'pledges' && <button className="button button-primary" type="button" disabled={!supabase || !permissions.pledge} onClick={() => openForm('pledges')}><Icon name="plus" size={15} /> Add pledge</button>}
            {tab === 'expenses' && <button className="button button-primary" type="button" disabled={!supabase || !permissions.expense} onClick={() => openForm('expenses')}><Icon name="plus" size={15} /> Submit expense</button>}
          </div>}
        </div>

        <div className="finance-toolbar">
          <div className="finance-tabs" role="tablist" aria-label="Finance record type">
            {(['giving', 'pledges', 'expenses'] as FinanceTab[]).map((item) =>
              <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => { setTab(item); setSearch(''); }}>
                <Icon name={item === 'giving' ? 'giving' : item === 'pledges' ? 'activity' : 'receipt'} size={15} /> {item === 'giving' ? 'Giving' : item === 'pledges' ? 'Pledges' : 'Expenses'}
              </button>)}
          </div>
          <label className="people-search finance-search"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${tab}`} aria-label={`Search ${tab}`} /></label>
        </div>

        {!permissions.view && supabase ? <div className="household-empty">Finance records are restricted to authorized roles.</div> : loading
          ? <div className="household-empty"><span className="loading-spinner" /> Loading financial records…</div>
          : tab === 'giving' ? <div className="people-table-wrap"><table className="people-table finance-table"><thead><tr><th>Donor</th><th>Category & method</th><th>Date</th><th>Branch</th><th>Status</th><th className="finance-amount">Amount</th></tr></thead>
            <tbody>{visibleGiving.map((record) => <tr key={record.id}>
              <td><strong>{record.donor_name || 'Anonymous gift'}</strong></td>
              <td><strong>{record.category}</strong><small>{record.payment_method}</small></td>
              <td>{formatDate(record.given_at)}</td><td>{branchName(record.branch_id)}</td>
              <td><span className={`member-status ${record.status === 'void' ? 'status-inactive' : record.status === 'pending' ? 'status-newcomer' : ''}`}>{record.status}</span></td>
              <td className="finance-amount"><strong>{formatAmount(Number(record.amount))}</strong></td>
            </tr>)}
            {!visibleGiving.length && <tr><td className="people-empty" colSpan={6}>{search ? 'No giving records match your search.' : 'No giving has been recorded yet.'}</td></tr>}</tbody></table></div>
          : tab === 'pledges' ? <div className="people-table-wrap"><table className="people-table finance-table"><thead><tr><th>Donor & purpose</th><th>Progress</th><th>Start / due</th><th>Branch</th><th>Status</th><th className="finance-amount">Pledged</th></tr></thead>
            <tbody>{visiblePledges.map((pledge) => {
              const received = verifiedGiving.filter((record) => record.pledge_id === pledge.id).reduce((sum, record) => sum + Number(record.amount), 0);
              const goal = Number(pledge.pledged_amount);
              const progress = Math.min(100, goal ? received / goal * 100 : 0);
              return <tr key={pledge.id}>
                <td><strong>{pledge.donor_name}</strong><small>{pledge.purpose}</small></td>
                <td><strong>{formatAmount(received)} / {formatAmount(goal)}</strong><div className="pledge-progress"><i style={{ width: `${progress}%` }} /></div></td>
                <td>{formatDate(pledge.start_date)}<small>{formatDate(pledge.due_date)}</small></td><td>{branchName(pledge.branch_id)}</td>
                <td><span className={`member-status ${pledge.status === 'cancelled' ? 'status-inactive' : ''}`}>{pledge.status}</span></td>
                <td className="finance-amount"><strong>{formatAmount(goal)}</strong></td>
              </tr>;
            })}
            {!visiblePledges.length && <tr><td className="people-empty" colSpan={6}>{search ? 'No pledges match your search.' : 'No pledges have been recorded yet.'}</td></tr>}</tbody></table></div>
          : <div className="people-table-wrap"><table className="people-table finance-table"><thead><tr><th>Expense</th><th>Category</th><th>Date</th><th>Branch</th><th>Status & review</th><th className="finance-amount">Amount</th><th>Actions</th></tr></thead>
            <tbody>{visibleExpenses.map((expense) => <tr key={expense.id}>
              <td><strong>{expense.description}</strong><small>{expense.vendor || 'No vendor specified'}</small></td>
              <td>{expense.category}</td><td>{formatDate(expense.incurred_at)}</td><td>{branchName(expense.branch_id)}</td>
              <td><span className={`member-status ${expense.status === 'rejected' ? 'status-inactive' : expense.status === 'submitted' ? 'status-newcomer' : ''}`}>{expense.status}</span>{expense.review_note && <small>{expense.review_note}</small>}</td>
              <td className="finance-amount"><strong>{formatAmount(Number(expense.amount))}</strong></td>
              <td><div className="finance-row-actions">
                {permissions.approve && expense.created_by !== userId && expense.status === 'submitted' && <>
                  <button className="finance-approve" type="button" disabled={reviewingId === expense.id} onClick={() => void reviewExpense(expense, 'approved')}>Approve</button>
                  <button className="finance-reject" type="button" disabled={reviewingId === expense.id} onClick={() => void reviewExpense(expense, 'rejected')}>Reject</button>
                </>}
                {permissions.approve && expense.created_by !== userId && expense.status === 'approved' &&
                  <button className="finance-approve" type="button" disabled={reviewingId === expense.id} onClick={() => void reviewExpense(expense, 'paid')}>Mark paid</button>}
              </div></td>
            </tr>)}
            {!visibleExpenses.length && <tr><td className="people-empty" colSpan={7}>{search ? 'No expenses match your search.' : 'No expense submissions yet.'}</td></tr>}</tbody></table></div>}

        <div className="people-table-footer"><span>{currentCount} {currentCount === 1 ? 'record' : 'records'}</span><span>Amounts shown in organization currency units.</span></div>
      </section>

      {dialog && <div className="member-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDialog(null); }}>
        <section className="member-modal finance-modal glass-card" role="dialog" aria-modal="true" aria-labelledby="finance-dialog-title">
          <div className="member-modal-heading"><div><span className="eyebrow">Finance</span>
            <h2 id="finance-dialog-title">{dialog === 'giving' ? 'Record giving' : dialog === 'pledges' ? 'Add a pledge' : 'Submit an expense'}</h2></div>
            <button className="icon-button" type="button" aria-label="Close finance form" onClick={() => setDialog(null)}><Icon name="close" size={18} /></button>
          </div>
          {dialog === 'giving' ? <form className="member-form" onSubmit={(event) => void submitGiving(event)}>
            <div className="member-form-grid">
              <label>Church member (optional)<select value={givingForm.member_id} onChange={(event) => setGivingForm((current) => ({ ...current, member_id: event.target.value }))}><option value="">Guest or anonymous</option>
                {people.map((person) => <option key={person.id} value={person.id}>{person.first_name} {person.last_name}</option>)}</select></label>
              {!givingForm.member_id && <label>Donor name (optional)<input maxLength={160} value={givingForm.donor_name} onChange={(event) => setGivingForm((current) => ({ ...current, donor_name: event.target.value }))} placeholder="Leave blank for anonymous" /></label>}
              <label>Amount<input type="number" required min="0.01" step="0.01" value={givingForm.amount} onChange={(event) => setGivingForm((current) => ({ ...current, amount: event.target.value }))} /></label>
              <label>Giving category<select value={givingForm.category} onChange={(event) => setGivingForm((current) => ({ ...current, category: event.target.value }))}><option value="tithe">Tithe</option><option value="offering">Offering</option><option value="missions">Missions</option><option value="building">Building fund</option><option value="benevolence">Benevolence</option><option value="other">Other</option></select></label>
              <label>Payment method<select value={givingForm.payment_method} onChange={(event) => setGivingForm((current) => ({ ...current, payment_method: event.target.value }))}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="mobile_money">Mobile money</option><option value="cheque">Cheque</option><option value="other">Other</option></select></label>
              <label>Date received<input type="date" required value={givingForm.given_at} onChange={(event) => setGivingForm((current) => ({ ...current, given_at: event.target.value }))} /></label>
              <label>Branch<select value={givingForm.branch_id} onChange={(event) => setGivingForm((current) => ({ ...current, branch_id: event.target.value }))}><option value="">Organization-wide</option>{organization?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
              <label className="member-notes-field">Link pledge (optional)<select value={givingForm.pledge_id} onChange={(event) => {
                const selectedPledge = pledges.find((pledge) => pledge.id === event.target.value);
                setGivingForm((current) => ({
                  ...current,
                  pledge_id: event.target.value,
                  member_id: selectedPledge?.member_id ?? current.member_id,
                  branch_id: selectedPledge?.branch_id ?? current.branch_id,
                }));
              }}><option value="">No pledge linked</option>{pledges.filter((pledge) => pledge.status === 'active' && (!givingForm.member_id || !pledge.member_id || pledge.member_id === givingForm.member_id)).map((pledge) => <option key={pledge.id} value={pledge.id}>{pledge.donor_name} · {pledge.purpose}</option>)}</select></label>
              <label className="member-notes-field">Private finance note<textarea rows={2} maxLength={500} value={givingForm.notes} onChange={(event) => setGivingForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            </div>
            {formError && <div className="people-error" role="alert">{formError}</div>}
            <div className="member-form-actions"><button type="button" className="button button-ghost" disabled={saving} onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save giving record'}</button></div>
          </form> : dialog === 'pledges' ? <form className="member-form" onSubmit={(event) => void submitPledge(event)}>
            <div className="member-form-grid">
              <label>Church member (optional)<select value={pledgeForm.member_id} onChange={(event) => setPledgeForm((current) => ({ ...current, member_id: event.target.value }))}><option value="">Guest or organization</option>
                {people.map((person) => <option key={person.id} value={person.id}>{person.first_name} {person.last_name}</option>)}</select></label>
              {!pledgeForm.member_id && <label>Donor / organization<input required maxLength={160} value={pledgeForm.donor_name} onChange={(event) => setPledgeForm((current) => ({ ...current, donor_name: event.target.value }))} /></label>}
              <label>Commitment amount<input type="number" required min="0.01" step="0.01" value={pledgeForm.pledged_amount} onChange={(event) => setPledgeForm((current) => ({ ...current, pledged_amount: event.target.value }))} /></label>
              <label>Purpose<input required maxLength={120} value={pledgeForm.purpose} onChange={(event) => setPledgeForm((current) => ({ ...current, purpose: event.target.value }))} placeholder="e.g. Building project" /></label>
              <label>Start date<input type="date" required value={pledgeForm.start_date} onChange={(event) => setPledgeForm((current) => ({ ...current, start_date: event.target.value }))} /></label>
              <label>Due date (optional)<input type="date" min={pledgeForm.start_date} value={pledgeForm.due_date} onChange={(event) => setPledgeForm((current) => ({ ...current, due_date: event.target.value }))} /></label>
              <label className="member-notes-field">Branch<select value={pledgeForm.branch_id} onChange={(event) => setPledgeForm((current) => ({ ...current, branch_id: event.target.value }))}><option value="">Organization-wide</option>{organization?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            </div>
            {formError && <div className="people-error" role="alert">{formError}</div>}
            <div className="member-form-actions"><button type="button" className="button button-ghost" disabled={saving} onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save pledge'}</button></div>
          </form> : <form className="member-form" onSubmit={(event) => void submitExpense(event)}>
            <div className="member-form-grid">
              <label>Amount<input type="number" required min="0.01" step="0.01" value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} /></label>
              <label>Category<select value={expenseForm.category} onChange={(event) => setExpenseForm((current) => ({ ...current, category: event.target.value }))}><option>Operations</option><option>Facilities</option><option>Ministry</option><option>Outreach</option><option>Staff</option><option>Travel</option><option>Other</option></select></label>
              <label>Vendor / payee<input maxLength={160} value={expenseForm.vendor} onChange={(event) => setExpenseForm((current) => ({ ...current, vendor: event.target.value }))} /></label>
              <label>Date incurred<input type="date" required value={expenseForm.incurred_at} onChange={(event) => setExpenseForm((current) => ({ ...current, incurred_at: event.target.value }))} /></label>
              <label className="member-notes-field">Description<input required maxLength={240} value={expenseForm.description} onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))} /></label>
              <label className="member-notes-field">Branch<select value={expenseForm.branch_id} onChange={(event) => setExpenseForm((current) => ({ ...current, branch_id: event.target.value }))}><option value="">Organization-wide</option>{organization?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            </div>
            <p className="finance-form-hint">New expenses are submitted for review. The submitter cannot approve or pay their own request.</p>
            {formError && <div className="people-error" role="alert">{formError}</div>}
            <div className="member-form-actions"><button type="button" className="button button-ghost" disabled={saving} onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit for review'}</button></div>
          </form>}
        </section>
      </div>}
    </section>
  </>;
}
