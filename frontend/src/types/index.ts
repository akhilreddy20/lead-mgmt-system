export interface User { id: string; name: string; email: string; role: 'admin' | 'counsellor' | 'telecaller'; }
export interface Lead {
  _id: string; name: string; email?: string; phone: string; source: string; status: string;
  assignedTo?: { _id: string; name: string; role: string }; assignmentHistory: any[];
  escalation?: any; notes: any[]; nextFollowUp?: string; course?: string; city?: string;
  isConverted: boolean; isLocked: boolean; version: number; createdAt: string; updatedAt: string;
}
export interface FollowUp { _id: string; leadId: any; scheduledDate: string; completedDate?: string; status: string; notes?: string; createdBy: any; }
export interface Payment { _id: string; leadId: string; amount: number; proofUrl?: string; proofVersions: any[]; currentVersion: number; verificationStatus: string; }
export interface ActivityLogEntry { _id: string; action: string; performedBy: { name: string; role: string }; details?: any; previousValue?: any; newValue?: any; createdAt: string; }
