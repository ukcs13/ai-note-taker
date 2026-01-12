import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Calendar, Video, ArrowRight, Plus, Clock } from 'lucide-react';

const Dashboard = () => {
  const [meetings, setMeetings] = useState([]);
  const [newMeetUrl, setNewMeetUrl] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchMeetings();
  }, []);

  const fetchMeetings = async () => {
    try {
      const res = await axios.get('http://localhost:3000/api/meetings');
      setMeetings(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const createMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMeetUrl) return;
    
    setIsCreating(true);
    try {
      await axios.post('http://localhost:3000/api/meetings', { meet_url: newMeetUrl });
      setNewMeetUrl('');
      await fetchMeetings();
    } catch (error) {
      console.error(error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Meeting Dashboard</h1>
          <p className="text-slate-500">Manage and track your AI-recorded sessions</p>
        </div>
      </div>
      
      {/* Create Meeting Card */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-10">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Video className="w-5 h-5 text-indigo-600" />
            Start New Session
        </h3>
        <form onSubmit={createMeeting} className="flex gap-4">
          <input
            type="text"
            placeholder="Paste Google Meet URL (e.g., https://meet.google.com/abc-defg-hij)"
            className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
            value={newMeetUrl}
            onChange={(e) => setNewMeetUrl(e.target.value)}
          />
          <button 
            type="submit" 
            disabled={isCreating || !newMeetUrl}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2 shadow-md hover:shadow-lg"
          >
            {isCreating ? 'Joining...' : (
                <>
                    <Plus className="w-5 h-5" /> Join Meeting
                </>
            )}
          </button>
        </form>
      </div>

      <h3 className="text-xl font-bold text-slate-800 mb-6">Recent Meetings</h3>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {meetings.length === 0 ? (
            <div className="col-span-full text-center py-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                <p className="text-slate-400 font-medium">No meetings recorded yet</p>
            </div>
        ) : (
            meetings.map((meeting: any) => (
            <Link key={meeting.id} to={`/meeting/${meeting.id}`} className="group">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-300 transition-all h-full flex flex-col">
                <div className="flex items-start justify-between mb-4">
                    <div className="p-2 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition">
                        <Video className="w-6 h-6 text-indigo-600" />
                    </div>
                    <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
                        {meeting.transcripts?.length || 0} transcripts
                    </span>
                </div>
                
                <h4 className="font-semibold text-slate-900 mb-2 truncate" title={meeting.meet_url}>
                    {meeting.meet_url.replace('https://meet.google.com/', '')}
                </h4>
                
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-4">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(meeting.started_at).toLocaleDateString()}</span>
                    <Clock className="w-4 h-4 ml-2" />
                    <span>{new Date(meeting.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                {meeting.summaries?.length > 0 ? (
                    <div className="mt-auto pt-4 border-t border-slate-100">
                        <p className="text-sm text-slate-600 line-clamp-2">
                            <span className="font-medium text-slate-900">Summary: </span>
                            {meeting.summaries[0].content}
                        </p>
                    </div>
                ) : (
                    <div className="mt-auto pt-4 border-t border-slate-100 text-sm text-slate-400 italic">
                        No summary generated
                    </div>
                )}
                
                <div className="mt-4 flex items-center text-indigo-600 text-sm font-medium group-hover:translate-x-1 transition-transform">
                    View Details <ArrowRight className="w-4 h-4 ml-1" />
                </div>
                </div>
            </Link>
            ))
        )}
      </div>
    </div>
  );
};

export default Dashboard;
