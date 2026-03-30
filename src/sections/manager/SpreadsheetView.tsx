import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Cancel01Icon, Delete02Icon, Download01Icon, Edit02Icon, FileSpreadsheetIcon, FilterIcon, Search01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface SpreadsheetRow {
  id: string;
  issue: string;
  owner: string;
  status: 'Draft' | 'Review' | 'Design' | 'Published' | 'On Hold';
  dueDate: string;
  notes: string;
}

const initialData: SpreadsheetRow[] = [
  { id: '1', issue: 'Issue #45 - Multimodal AI', owner: 'Alex', status: 'Design', dueDate: '2024-07-15', notes: 'Waiting for visuals' },
  { id: '2', issue: 'Issue #46 - Agent Tooling', owner: 'Sarah', status: 'Draft', dueDate: '2024-07-29', notes: 'Research in progress' },
  { id: '3', issue: 'Issue #44 - Safety Benchmarks', owner: 'Marcus', status: 'Published', dueDate: '2024-07-01', notes: 'Great engagement' },
  { id: '4', issue: 'Issue #47 - On-Device Models', owner: 'Emily', status: 'Review', dueDate: '2024-08-05', notes: 'Needs fact-check' },
  { id: '5', issue: 'Issue #48 - Open Weights', owner: 'David', status: 'Draft', dueDate: '2024-08-12', notes: 'Outline approved' },
  { id: '6', issue: 'Issue #43 - Policy Update', owner: 'Lisa', status: 'Published', dueDate: '2024-06-24', notes: 'High open rate' },
  { id: '7', issue: 'Issue #49 - Developer Tools', owner: 'Alex', status: 'On Hold', dueDate: '2024-08-19', notes: 'Pending interview' },
  { id: '8', issue: 'Issue #50 - Research Roundup', owner: 'Sarah', status: 'Draft', dueDate: '2024-08-26', notes: 'Collecting papers' },
];

const statusOptions = ['Draft', 'Review', 'Design', 'Published', 'On Hold'];

const statusColors: Record<string, string> = {
  'Draft': 'bg-[#F3F4F6] text-[#737373]',
  'Review': 'bg-[#D93A3A]/10 text-[#D93A3A]',
  'Design': 'bg-purple-100 text-purple-700',
  'Published': 'bg-green-100 text-green-700',
  'On Hold': 'bg-amber-100 text-amber-700'
};

export function SpreadsheetView() {
  const [data, setData] = useState<SpreadsheetRow[]>(initialData);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Partial<SpreadsheetRow>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRow, setNewRow] = useState<Partial<SpreadsheetRow>>({
    status: 'Draft'
  });

  const filteredData = data.filter(row => 
    row.issue.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.owner.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.notes.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExport = () => {
    const worksheet = XLSX.utils.json_to_sheet(data.map(row => ({
      'Issue': row.issue,
      'Owner': row.owner,
      'Status': row.status,
      'Due Date': row.dueDate,
      'Notes': row.notes
    })));
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'AI-BREAK Content');
    
    XLSX.writeFile(workbook, `Pulse_AI_Content_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Excel file downloaded');
  };

  const handleEdit = (row: SpreadsheetRow) => {
    setEditingId(row.id);
    setEditRow(row);
  };

  const handleSave = () => {
    if (editingId && editRow) {
      setData(data.map(row => row.id === editingId ? { ...row, ...editRow } as SpreadsheetRow : row));
      setEditingId(null);
      setEditRow({});
      toast.success('Row updated');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditRow({});
  };

  const handleDelete = (id: string) => {
    setData(data.filter(row => row.id !== id));
    toast.success('Row deleted');
  };

  const handleAdd = () => {
    if (!newRow.issue || !newRow.owner) {
      toast.error('Please fill in required fields');
      return;
    }

    const row: SpreadsheetRow = {
      id: Date.now().toString(),
      issue: newRow.issue || '',
      owner: newRow.owner || '',
      status: (newRow.status as SpreadsheetRow['status']) || 'Draft',
      dueDate: newRow.dueDate || new Date().toISOString().split('T')[0],
      notes: newRow.notes || ''
    };

    setData([...data, row]);
    setNewRow({ status: 'Draft' });
    setShowAddModal(false);
    toast.success('Row added');
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#171717]">Content Spreadsheet</h2>
          <p className="text-sm text-[#737373]">Manage all newsletter issues</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExport}
            className="btn-secondary flex items-center gap-2"
          >
            <HugeiconsIcon icon={Download01Icon} className="w-4 h-4" />
            Export Excel
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <HugeiconsIcon icon={Add01Icon} className="w-4 h-4" />
            Add Row
          </button>
        </div>
      </div>

      {/* Search and filter */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <HugeiconsIcon icon={Search01Icon} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search issues, owners, notes..."
            className="w-full pl-10 pr-4 py-2"
          />
        </div>
        <button className="p-2 text-[#737373] hover:text-[#171717] hover:bg-[#F3F4F6] rounded-lg transition-colors">
          <HugeiconsIcon icon={FilterIcon} className="w-5 h-5" />
        </button>
      </div>

      {/* Spreadsheet */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F9FAFB]">
                <th className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase tracking-wider">Project</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase tracking-wider">Department</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase tracking-wider">Status</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase tracking-wider">Due Date</th>                
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E5]">
              {filteredData.map((row) => (
                <tr key={row.id} className="hover:bg-[#F9FAFB] group">
                  {editingId === row.id ? (
                    <>
                      <td className="py-2 px-4">
                        <input
                          type="text"
                          value={editRow.issue || ''}
                          onChange={(e) => setEditRow({ ...editRow, issue: e.target.value })}
                          className="w-full py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 px-4">
                        <input
                          type="text"
                          value={editRow.owner || ''}
                          onChange={(e) => setEditRow({ ...editRow, owner: e.target.value })}
                          className="w-full py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 px-4">
                        <select
                          value={editRow.status || ''}
                          onChange={(e) => setEditRow({ ...editRow, status: e.target.value as SpreadsheetRow['status'] })}
                          className="w-full py-1 text-sm"
                        >
                          {statusOptions.map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-4">
                        <input
                          type="date"
                          value={editRow.dueDate || ''}
                          onChange={(e) => setEditRow({ ...editRow, dueDate: e.target.value })}
                          className="w-full py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 px-4">
                        <input
                          type="text"
                          value={editRow.notes || ''}
                          onChange={(e) => setEditRow({ ...editRow, notes: e.target.value })}
                          className="w-full py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <button 
                            onClick={handleSave}
                            className="p-1 text-green-600 hover:bg-green-100 rounded"
                          >
                            <HugeiconsIcon icon={Tick01Icon} className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={handleCancel}
                            className="p-1 text-red-600 hover:bg-red-100 rounded"
                          >
                            <HugeiconsIcon icon={Cancel01Icon} className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 px-4 text-[#171717]">{row.issue}</td>
                      <td className="py-3 px-4 text-[#737373]">{row.owner}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-1 rounded-full ${statusColors[row.status]}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#737373]">{row.dueDate}</td>

                      
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredData.length === 0 && (
          <div className="p-8 text-center text-[#737373]">
            No results found for &ldquo;{searchTerm}&rdquo;
          </div>
        )}
      </div>

      {/* Add Row Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#D93A3A]/10 rounded-lg flex items-center justify-center">
                <HugeiconsIcon icon={FileSpreadsheetIcon} className="w-5 h-5 text-[#D93A3A]" />
              </div>
              <h3 className="text-lg font-bold text-[#171717]">Add New Issue</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-[#737373] mb-1 block">Issue Name *</label>
                <input
                  type="text"
                  value={newRow.issue || ''}
                  onChange={(e) => setNewRow({ ...newRow, issue: e.target.value })}
                  placeholder="e.g., Issue #51 - Topic Name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-[#737373] mb-1 block">Owner *</label>
                  <input
                    type="text"
                    value={newRow.owner || ''}
                    onChange={(e) => setNewRow({ ...newRow, owner: e.target.value })}
                    placeholder="Name"
                  />
                </div>
                <div>
                  <label className="text-sm text-[#737373] mb-1 block">Status</label>
                  <select
                    value={newRow.status}
                    onChange={(e) => setNewRow({ ...newRow, status: e.target.value as SpreadsheetRow['status'] })}
                    className="w-full"
                  >
                    {statusOptions.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm text-[#737373] mb-1 block">Due Date</label>
                <input
                  type="date"
                  value={newRow.dueDate || ''}
                  onChange={(e) => setNewRow({ ...newRow, dueDate: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-[#737373] mb-1 block">Notes</label>
                <textarea
                  value={newRow.notes || ''}
                  onChange={(e) => setNewRow({ ...newRow, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAdd}
                  className="flex-1 btn-primary"
                >
                  Add Issue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
