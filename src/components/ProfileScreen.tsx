import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Store,
  HardDrive,
  Trash2,
  Camera,
  Loader2,
  Download,
  Upload,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { UserProfile, BackupSummary } from '../types';
import {
  saveProfileImage,
  getProfileImage,
} from '../utils/imageStorage';
import {
  saveBackupFile,
  restoreBackupFromFile,
  applyRestorePayload,
} from '../utils/backup';
import { StorageHealthModal } from './StorageHealthModal';
import { BackupReminderModal } from './BackupReminderModal';

interface ProfileScreenProps {
  profile?: UserProfile;
  onUpdateProfile?: (profile: UserProfile) => void;
  onResetAllData?: () => void;
}

const DEFAULT_PROFILE: UserProfile = {
  ownerName: 'Store Owner',
  storeName: 'My Store',
  email: '',
  phone: '',
  address: '',
  businessType: 'Retail & Grocery',
  currency: 'PHP (₱)',
};

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  profile = DEFAULT_PROFILE,
  onUpdateProfile,
  onResetAllData,
}) => {
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [formData, setFormData] = useState<UserProfile>(profile);
  const [editingField, setEditingField] = useState<'storeName' | 'ownerName' | 'businessType' | null>(null);
  const [tempValue, setTempValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<BackupSummary | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [showResetBackupReminder, setShowResetBackupReminder] = useState(false);
  const [showRestoreBackupReminder, setShowRestoreBackupReminder] = useState(false);

  // Sync formData when profile prop changes
  useEffect(() => {
    setFormData(profile);
  }, [profile]);

  // Load offline profile image if not attached
  useEffect(() => {
    if (!formData.avatarUrl) {
      getProfileImage()
        .then((avatar) => {
          if (avatar) {
            setFormData((prev) => ({ ...prev, avatarUrl: avatar }));
          }
        })
        .catch(() => {});
    }
  }, []);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPG, WebP).');
      return;
    }

    try {
      setIsUploadingPhoto(true);
      const dataUrl = await saveProfileImage(file);
      const updated: UserProfile = {
        ...formData,
        avatarUrl: dataUrl,
      };
      setFormData(updated);
      if (onUpdateProfile) {
        onUpdateProfile(updated);
      }
      toast.success('Photo updated');
    } catch (err) {
      console.error('Failed to save profile photo:', err);
      toast.error('Failed to save photo.');
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleStartEdit = (field: 'storeName' | 'ownerName' | 'businessType') => {
    setEditingField(field);
    setTempValue(formData[field] || '');
  };

  const handleSaveField = (field: 'storeName' | 'ownerName' | 'businessType') => {
    const trimmed = tempValue.trim();
    if (field === 'storeName' && !trimmed) {
      toast.error('Store name cannot be empty.');
      return;
    }
    const updated: UserProfile = {
      ...formData,
      [field]: trimmed || (field === 'ownerName' ? 'Store Owner' : formData[field]),
    };
    setFormData(updated);
    if (onUpdateProfile) {
      onUpdateProfile(updated);
    }
    setEditingField(null);
    toast.success('Updated');
  };

  const handleExportBackup = async () => {
    try {
      setIsExporting(true);
      const savedPath = await saveBackupFile();
      toast.success(`Backup saved: ${savedPath}`);
    } catch (err) {
      console.error('Failed to export backup:', err);
      toast.error('Failed to export backup file.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSelectRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const summary = await restoreBackupFromFile(file);
      setPendingRestore(summary);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid backup file.';
      toast.error(message);
    } finally {
      if (restoreFileInputRef.current) {
        restoreFileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore || !pendingRestore.backupData) return;
    try {
      setIsRestoring(true);
      await applyRestorePayload(pendingRestore.backupData);
      setTimeout(() => {
        setIsRestoring(false);
        toast.warning('Restore applied. Please reopen the app.');
      }, 5000);
    } catch (err: unknown) {
      console.error('Restore failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to restore backup.');
      setIsRestoring(false);
    }
  };

  return (
    <motion.div
      id="profile-screen-view"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="w-full max-w-[430px] mx-auto px-5 pt-3 sm:pt-4"
      style={{ paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handlePhotoUpload}
        className="hidden"
        aria-hidden="true"
      />
      <input
        ref={restoreFileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleSelectRestoreFile}
        className="hidden"
        aria-hidden="true"
      />

      {/* Top Profile Avatar & Store Header */}
      <div className="flex flex-col items-center text-center pt-2 pb-5">
        <div className="relative mb-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingPhoto}
            aria-label="Change photo"
            className="w-20 h-20 rounded-full bg-[#E8F3E8] border-2 border-white shadow-sm overflow-hidden flex items-center justify-center text-[#2F7D32] transition-transform active:scale-95 cursor-pointer relative group focus:outline-none"
          >
            {formData.avatarUrl ? (
              <img
                src={formData.avatarUrl}
                alt={formData.storeName}
                className="w-full h-full object-cover select-none"
              />
            ) : (
              <Store size={34} strokeWidth={1.8} className="text-[#2F7D32]" />
            )}
            <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera size={18} className="text-white" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingPhoto}
            aria-label="Upload photo"
            className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-[#2F7D32] hover:bg-[#256B29] text-white flex items-center justify-center shadow-xs border-2 border-white cursor-pointer transition-colors"
          >
            {isUploadingPhoto ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Camera size={11} strokeWidth={2.4} />
            )}
          </button>
        </div>

        <h1 className="text-[20px] font-bold text-[#202522] tracking-tight leading-snug">
          {formData.storeName || 'My Store'}
        </h1>
        <p className="text-[13.5px] text-[#68716C] mt-0.5 font-medium">
          {formData.ownerName || 'Store Owner'}
        </p>
      </div>

      {/* Main Containers */}
      <div className="space-y-4.5">
        {/* Store Info Section */}
        <div>
          <p className="text-[12px] font-semibold text-[#68716C] px-1 mb-2">
            Store info
          </p>
          <div className="space-y-2">
            {/* Name Container */}
            <div className="bg-white border border-[#E1E6E2] rounded-2xl px-4 py-3 shadow-2xs">
              {editingField === 'storeName' ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-[#68716C] block mb-1">
                      Name
                    </span>
                    <input
                      type="text"
                      autoFocus
                      value={tempValue}
                      onChange={(e) => setTempValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveField('storeName');
                        if (e.key === 'Escape') setEditingField(null);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-[#2F7D32] text-[13.5px] text-[#202522] focus:outline-none bg-white"
                      placeholder="Store name"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveField('storeName')}
                    className="text-[13px] text-[#68716C] hover:text-[#202522] font-medium underline underline-offset-2 cursor-pointer transition-colors shrink-0 pt-3"
                  >
                    done
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11.5px] font-medium text-[#68716C] block">
                      Name
                    </span>
                    <span className="text-[14px] font-semibold text-[#202522] truncate block">
                      {formData.storeName || 'My Store'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStartEdit('storeName')}
                    className="text-[13px] text-[#68716C] hover:text-[#202522] font-medium underline underline-offset-2 cursor-pointer transition-colors shrink-0"
                  >
                    edit
                  </button>
                </div>
              )}
            </div>

            {/* Owner Container */}
            <div className="bg-white border border-[#E1E6E2] rounded-2xl px-4 py-3 shadow-2xs">
              {editingField === 'ownerName' ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-[#68716C] block mb-1">
                      Owner
                    </span>
                    <input
                      type="text"
                      autoFocus
                      value={tempValue}
                      onChange={(e) => setTempValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveField('ownerName');
                        if (e.key === 'Escape') setEditingField(null);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-[#2F7D32] text-[13.5px] text-[#202522] focus:outline-none bg-white"
                      placeholder="Owner name"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveField('ownerName')}
                    className="text-[13px] text-[#68716C] hover:text-[#202522] font-medium underline underline-offset-2 cursor-pointer transition-colors shrink-0 pt-3"
                  >
                    done
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11.5px] font-medium text-[#68716C] block">
                      Owner
                    </span>
                    <span className="text-[14px] font-semibold text-[#202522] truncate block">
                      {formData.ownerName || 'Store Owner'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStartEdit('ownerName')}
                    className="text-[13px] text-[#68716C] hover:text-[#202522] font-medium underline underline-offset-2 cursor-pointer transition-colors shrink-0"
                  >
                    edit
                  </button>
                </div>
              )}
            </div>

            {/* Category Container */}
            <div className="bg-white border border-[#E1E6E2] rounded-2xl px-4 py-3 shadow-2xs">
              {editingField === 'businessType' ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-[#68716C] block mb-1">
                      Category
                    </span>
                    <select
                      autoFocus
                      value={formData.businessType}
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated: UserProfile = {
                          ...formData,
                          businessType: val,
                        };
                        setFormData(updated);
                        if (onUpdateProfile) {
                          onUpdateProfile(updated);
                        }
                        setEditingField(null);
                        toast.success('Category updated');
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-[#2F7D32] text-[13.5px] text-[#202522] focus:outline-none bg-white cursor-pointer"
                    >
                      <option value="Retail & Grocery">Retail & Grocery</option>
                      <option value="Sari-Sari Store">Sari-Sari Store</option>
                      <option value="Supermarket & Convenience">Supermarket & Convenience</option>
                      <option value="Bakery & Food Stand">Bakery & Food Stand</option>
                      <option value="Wholesale & Distribution">Wholesale & Distribution</option>
                      <option value="General Merchandising">General Merchandising</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingField(null)}
                    className="text-[13px] text-[#68716C] hover:text-[#202522] font-medium underline underline-offset-2 cursor-pointer transition-colors shrink-0 pt-3"
                  >
                    done
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11.5px] font-medium text-[#68716C] block">
                      Category
                    </span>
                    <span className="text-[14px] font-semibold text-[#202522] truncate block">
                      {formData.businessType || 'Retail & Grocery'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingField('businessType')}
                    className="text-[13px] text-[#68716C] hover:text-[#202522] font-medium underline underline-offset-2 cursor-pointer transition-colors shrink-0"
                  >
                    edit
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* System Storage Container */}
        <div>
          <p className="text-[12px] font-semibold text-[#68716C] px-1 mb-2">
            Storage
          </p>
          <div className="bg-white border border-[#E1E6E2] rounded-2xl overflow-hidden shadow-2xs">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <HardDrive size={16} className="text-[#68716C]" />
                <span className="text-[13.5px] text-[#68716C]">Database</span>
              </div>
              <span className="text-[13px] font-semibold text-[#202522]">
                Local and offline
              </span>
            </div>
          </div>
        </div>

        {/* Backup & Tools */}
        <div>
          <p className="text-[12px] font-semibold text-[#68716C] px-1 mb-2">
            Backups
          </p>

          <div className="grid grid-cols-3 gap-2">
            {/* Export Button */}
            <button
              type="button"
              onClick={handleExportBackup}
              disabled={isExporting}
              className="p-3 bg-white hover:bg-[#F6FAF6] border border-[#E1E6E2] hover:border-[#81B783] rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-[0.98] disabled:opacity-60"
            >
              <div className="w-8 h-8 rounded-full bg-[#E8F3E8] text-[#2F7D32] flex items-center justify-center">
                {isExporting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} strokeWidth={2.2} />
                )}
              </div>
              <span className="text-[12px] font-semibold text-[#202522] leading-tight">
                Export
              </span>
            </button>

            {/* Restore Button */}
            <button
              type="button"
              onClick={() => restoreFileInputRef.current?.click()}
              disabled={isRestoring}
              className="p-3 bg-white hover:bg-[#F6FAF6] border border-[#E1E6E2] hover:border-[#81B783] rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-[0.98] disabled:opacity-60"
            >
              <div className="w-8 h-8 rounded-full bg-[#E8F3E8] text-[#2F7D32] flex items-center justify-center">
                <Upload size={16} strokeWidth={2.2} />
              </div>
              <span className="text-[12px] font-semibold text-[#202522] leading-tight">
                Restore
              </span>
            </button>

            {/* Storage Health Button */}
            <button
              type="button"
              onClick={() => setShowHealthModal(true)}
              className="p-3 bg-white hover:bg-[#F6FAF6] border border-[#E1E6E2] hover:border-[#81B783] rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-[0.98]"
            >
              <div className="w-8 h-8 rounded-full bg-[#E8F3E8] text-[#2F7D32] flex items-center justify-center">
                <ShieldCheck size={16} strokeWidth={2.2} />
              </div>
              <span className="text-[12px] font-semibold text-[#202522] leading-tight">
                Health
              </span>
            </button>
          </div>

          {/* Pending Restore Preview */}
          {pendingRestore && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-2.5 p-3.5 bg-white border border-[#E1E6E2] rounded-2xl shadow-2xs space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className="text-[#C07000]" />
                  <span className="text-[13px] font-semibold text-[#202522] truncate">
                    {pendingRestore.storeName}
                  </span>
                </div>
                <span className="text-[11px] text-[#68716C]">
                  {pendingRestore.productCount} items · {pendingRestore.salesCount} sales
                </span>
              </div>

              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setPendingRestore(null)}
                  disabled={isRestoring}
                  className="flex-1 py-1.5 rounded-xl border border-[#E1E6E2] text-[12px] font-medium text-[#202522] hover:bg-[#F4F6F4] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setShowRestoreBackupReminder(true)}
                  disabled={isRestoring}
                  className="flex-1 py-1.5 rounded-xl bg-[#2F7D32] hover:bg-[#256B29] text-white text-[12px] font-semibold transition-colors cursor-pointer shadow-2xs flex items-center justify-center gap-1"
                >
                  {isRestoring ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Restoring...</span>
                    </>
                  ) : (
                    <span>Apply Restore</span>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {/* Reset Action */}
        {onResetAllData && (
          <div className="pt-2">
            <button
              id="clear-all-data-button"
              type="button"
              onClick={() => setShowResetBackupReminder(true)}
              className="w-full py-2.5 rounded-xl text-[13px] font-medium text-[#D94841] hover:bg-red-50/70 border border-transparent hover:border-red-100 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trash2 size={14} />
              <span>Reset all data</span>
            </button>
          </div>
        )}
      </div>

      {/* Storage Health Check Modal */}
      <StorageHealthModal
        isOpen={showHealthModal}
        onClose={() => setShowHealthModal(false)}
      />

      {/* Backup Reminder for Factory Reset */}
      <BackupReminderModal
        isOpen={showResetBackupReminder}
        title="Reset all data"
        description="This will clear your products and sales history from this device."
        destructiveActionLabel="Yes, Reset Everything"
        onProceed={() => {
          setShowResetBackupReminder(false);
          if (onResetAllData) {
            onResetAllData();
            toast.success('All data has been reset.');
          }
        }}
        onCancel={() => setShowResetBackupReminder(false)}
      />

      {/* Backup Reminder for Restore Overwrite */}
      <BackupReminderModal
        isOpen={showRestoreBackupReminder}
        title="Restore database"
        description="Restoring will replace current records with the selected backup file."
        destructiveActionLabel="Yes, Restore Now"
        onProceed={() => {
          setShowRestoreBackupReminder(false);
          handleConfirmRestore();
        }}
        onCancel={() => setShowRestoreBackupReminder(false)}
      />
    </motion.div>
  );
};
