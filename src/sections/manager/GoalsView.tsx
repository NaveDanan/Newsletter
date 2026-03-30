import { HugeiconsIcon } from "@hugeicons/react";
import { AnalyticsDownIcon, AnalyticsUpIcon, Cancel01Icon, Edit02Icon, MinusSignIcon, Target01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import { toast } from 'sonner';

interface Goal {
  id: string;
  title: string;
  target: string;
  current: string;
  progress: number;
  status: 'ahead' | 'on-track' | 'behind';
  deadline: string;
}

const initialGoals: Goal[] = [
  {
    id: '1',
    title: 'Grow Subscribers',
    target: '+15%',
    current: '+12%',
    progress: 80,
    status: 'on-track',
    deadline: 'Q3 2024'
  },
  {
    id: '2',
    title: 'Improve Open Rate',
    target: '42%',
    current: '38.5%',
    progress: 92,
    status: 'ahead',
    deadline: 'Q3 2024'
  },
  {
    id: '3',
    title: 'Launch Short-form Series',
    target: '10 episodes',
    current: '4 episodes',
    progress: 40,
    status: 'behind',
    deadline: 'Aug 2024'
  },
  {
    id: '4',
    title: 'Increase Click-through Rate',
    target: '8%',
    current: '6.2%',
    progress: 78,
    status: 'on-track',
    deadline: 'Q3 2024'
  },
  {
    id: '5',
    title: 'Reduce Unsubscribe Rate',
    target: '< 0.5%',
    current: '0.3%',
    progress: 100,
    status: 'ahead',
    deadline: 'Ongoing'
  }
];

export function GoalsView() {
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const getStatusIcon = (status: Goal['status']) => {
    switch (status) {
      case 'ahead':
        return <HugeiconsIcon icon={AnalyticsUpIcon} className="w-5 h-5 text-green-600" />;
      case 'on-track':
        return <HugeiconsIcon icon={MinusSignIcon} className="w-5 h-5 text-[#D93A3A]" />;
      case 'behind':
        return <HugeiconsIcon icon={AnalyticsDownIcon} className="w-5 h-5 text-red-600" />;
    }
  };

  const getStatusBadge = (status: Goal['status']) => {
    switch (status) {
      case 'ahead':
        return 'bg-green-100 text-green-700';
      case 'on-track':
        return 'bg-[#D93A3A]/10 text-[#D93A3A]';
      case 'behind':
        return 'bg-red-100 text-red-700';
    }
  };

  const getProgressColor = (_progress: number, status: Goal['status']) => {
    if (status === 'ahead') return 'bg-green-600';
    if (status === 'behind') return 'bg-red-600';
    return 'bg-[#D93A3A]';
  };

  const handleEdit = (goal: Goal) => {
    setEditingId(goal.id);
    setEditValue(goal.current);
  };

  const handleSave = () => {
    if (editingId && editValue) {
      setGoals(goals.map(goal => {
        if (goal.id === editingId) {
          const newProgress = Math.min(100, goal.progress + 5);
          return { ...goal, current: editValue, progress: newProgress };
        }
        return goal;
      }));
      setEditingId(null);
      toast.success('Goal updated');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValue('');
  };

  const overallProgress = Math.round(goals.reduce((acc, g) => acc + g.progress, 0) / goals.length);

  return (
    <div className="space-y-6">
      {/* Overall progress */}
      <div className="dashboard-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#171717]">Overall Progress</h2>
            <p className="text-sm text-[#737373]">Track your key objectives</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-[#D93A3A]">{overallProgress}%</p>
            <p className="text-sm text-[#737373]">of goals achieved</p>
          </div>
        </div>
        <div className="h-3 bg-[#E5E5E5] rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-[#D93A3A] to-green-600 transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Goals grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {goals.map((goal) => (
          <div key={goal.id} className="dashboard-card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#D93A3A]/10 rounded-lg flex items-center justify-center">
                  <HugeiconsIcon icon={Target01Icon} className="w-5 h-5 text-[#D93A3A]" />
                </div>
                <div>
                  <h3 className="font-medium text-[#171717]">{goal.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBadge(goal.status)}`}>
                    {goal.status.replace('-', ' ')}
                  </span>
                </div>
              </div>
              {getStatusIcon(goal.status)}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#737373]">Target</span>
                <span className="font-medium text-[#171717]">{goal.target}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#737373]">Current</span>
                {editingId === goal.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-24 py-1 text-sm"
                      autoFocus
                    />
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
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[#D93A3A] font-medium">{goal.current}</span>
                    <button 
                      onClick={() => handleEdit(goal)}
                      className="p-1 text-[#A3A3A3] hover:text-[#171717] opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <HugeiconsIcon icon={Edit02Icon} className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-[#737373]">Deadline</span>
                <span className="text-sm text-[#171717]">{goal.deadline}</span>
              </div>

              {/* Progress bar */}
              <div className="pt-2">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-[#737373]">Progress</span>
                  <span className="text-[#171717]">{goal.progress}%</span>
                </div>
                <div className="h-2 bg-[#E5E5E5] rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getProgressColor(goal.progress, goal.status)} transition-all duration-500`}
                    style={{ width: `${goal.progress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
