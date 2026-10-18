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
  X,
  Check,
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

/**
 * Formats user input as a standard 9 to 12 digit Tax Identification Number (TIN).
 * Strictly caps raw digits at 12 to prevent excessive numbers.
 */
function formatTINInput(value: string): string {
  // Enforce absolute strict limit of 12 digits
  const digits = value.replace(/\D/g, '').slice(0, 12);
  if (!digits) return '';

  const parts: string[] = [];
  if (digits.length > 0) parts.push(digits.slice(0, 3));
  if (digits.length > 3) parts.push(digits.slice(3, 6));
  if (digits.length > 6) parts.push(digits.slice(6, 9));
  if (digits.length > 9) parts.push(digits.slice(9, 12));

  return parts.join('-');
}

const DEFAULT_PROFILE: UserProfile = {
  ownerName: 'Store Owner',
  storeName: 'My Store',
  tinNumber: '',
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
  const [editingField, setEditingField] = useState<'storeName' | 'ownerName' | 'businessType' | 'tinNumber' | null>(null);
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

  const handleStartEdit = (field: 'storeName' | 'ownerName' | 'businessType' | 'tinNumber') => {
    setEditingField(field);
    setTempValue(formData[field] || '');
  };

  const handleSaveField = (field: 'storeName' | 'ownerName' | 'businessType' | 'tinNumber') => {
    const trimmed = tempValue.trim();
    if (field === 'storeName' && !trimmed) {
      toast.error('Store name cannot be empty.');
      return;
    }

    if (field === 'tinNumber' && trimmed) {
      const digits = trimmed.replace(/\D/g, '');
      if (digits.length > 0 && digits.length < 9) {
        toast.error('TIN must be 9 or 12 digits (e.g. 000-123-456).');
        return;
      }
    }

    const finalValue = field === 'tinNumber'
      ? (trimmed ? formatTINInput(trimmed.replace(/\D/g, '').slice(0, 12)) : '')
      : (trimmed || (field === 'ownerName' ? 'Store Owner' : formData[field]));

    const updated: UserProfile = {
      ...formData,
      [field]: finalValue,
    };
    setFormData(updated);
    if (onUpdateProfile) {
      onUpdateProfile(updated);
    }
    setEditingField(null);
    toast.success(field === 'tinNumber' ? (trimmed ? 'TIN updated' : 'TIN cleared') : 'Updated');
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
            className="w-20 h-20 rounded-full bg-[#F4F4F5] border-2 border-white shadow-sm overflow-hidden flex items-center justify-center text-[#18181B] transition-transform active:scale-95 cursor-pointer relative group focus:outline-none"
          >
            {formData.avatarUrl ? (
              <img
                src={formData.avatarUrl}
                alt={formData.storeName}
                className="w-full h-full object-cover select-none"
              />
            ) : (
              <Store size={34} strokeWidth={1.8} className="text-[#18181B]" />
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
            className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-[#18181B] hover:bg-[#27272A] text-white flex items-center justify-center shadow-xs border-2 border-white cursor-pointer transition-colors"
          >
            {isUploadingPhoto ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Camera size={11} strokeWidth={2.4} />
            )}
          </button>
        </div>

        <h1 className="text-[20px] font-bold text-[#18181B] tracking-tight leading-snug">
          {formData.storeName || 'My Store'}
        </h1>
        <p className="text-[13.5px] text-[#71717A] mt-0.5 font-medium">
          {formData.ownerName || 'Store Owner'}
        </p>
      </div>

      {/* Main Sections */}
      <div className="space-y-4.5">
        {/* Store Info Section - Single Clean Surface (No Box-in-Box, Seamless Inline Edit) */}
        <div>
          <div className="flex items-center justify-between px-1 mb-1.5">
            <p className="text-[12px] font-semibold text-[#71717A]">
              Store info
            </p>
            {editingField && (
              <span className="text-[11px] font-medium text-[#71717A]">
                Editing {editingField === 'storeName' ? 'store name' : editingField === 'ownerName' ? 'owner' : editingField === 'businessType' ? 'category' : 'TIN'}
              </span>
            )}
          </div>

          <div className="bg-white border border-[#E4E4E7] rounded-2xl px-4 divide-y divide-[#F4F4F5] shadow-xs">
            {/* 1. Store Name Row */}
            <div className="py-3">
              {editingField === 'storeName' ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <label className="text-[11px] font-medium text-[#71717A] block mb-0.5">
                      Store Name
                    </label>
                    <input
                      type="text"
                      autoFocus
                      value={tempValue}
                      onChange={(e) => setTempValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveField('storeName');
                        if (e.key === 'Escape') setEditingField(null);
                      }}
                      className="w-full bg-transparent border-b border-[#18181B] pb-0.5 pt-0.5 text-[14px] font-semibold text-[#18181B] focus:outline-none placeholder:text-[#A1A1AA]"
                      placeholder="Enter store name"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pt-3">
                    <button
                      type="button"
                      onClick={() => setEditingField(null)}
                      className="px-2 py-1 text-[12px] font-medium text-[#71717A] hover:text-[#18181B] rounded-md hover:bg-[#F4F4F5] transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveField('storeName')}
                      className="px-3 py-1 bg-[#18181B] hover:bg-[#27272A] text-white text-[12px] font-semibold rounded-md shadow-xs active:scale-95 transition-all cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11.5px] font-medium text-[#71717A] block">
                      Store Name
                    </span>
                    <span className="text-[14px] font-semibold text-[#18181B] truncate block mt-0.5">
                      {formData.storeName || 'My Store'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStartEdit('storeName')}
                    className="text-[12.5px] font-medium text-[#71717A] hover:text-[#18181B] px-2.5 py-1 rounded-lg hover:bg-[#F4F4F5] active:scale-95 transition-all cursor-pointer shrink-0"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>

            {/* 2. Owner Row */}
            <div className="py-3">
              {editingField === 'ownerName' ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <label className="text-[11px] font-medium text-[#71717A] block mb-0.5">
                      Owner Name
                    </label>
                    <input
                      type="text"
                      autoFocus
                      value={tempValue}
                      onChange={(e) => setTempValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveField('ownerName');
                        if (e.key === 'Escape') setEditingField(null);
                      }}
                      className="w-full bg-transparent border-b border-[#18181B] pb-0.5 pt-0.5 text-[14px] font-semibold text-[#18181B] focus:outline-none placeholder:text-[#A1A1AA]"
                      placeholder="Enter owner name"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pt-3">
                    <button
                      type="button"
                      onClick={() => setEditingField(null)}
                      className="px-2 py-1 text-[12px] font-medium text-[#71717A] hover:text-[#18181B] rounded-md hover:bg-[#F4F4F5] transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveField('ownerName')}
                      className="px-3 py-1 bg-[#18181B] hover:bg-[#27272A] text-white text-[12px] font-semibold rounded-md shadow-xs active:scale-95 transition-all cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11.5px] font-medium text-[#71717A] block">
                      Owner
                    </span>
                    <span className="text-[14px] font-semibold text-[#18181B] truncate block mt-0.5">
                      {formData.ownerName || 'Store Owner'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStartEdit('ownerName')}
                    className="text-[12.5px] font-medium text-[#71717A] hover:text-[#18181B] px-2.5 py-1 rounded-lg hover:bg-[#F4F4F5] active:scale-95 transition-all cursor-pointer shrink-0"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>

            {/* 3. Category Row */}
            <div className="py-3">
              {editingField === 'businessType' ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <label className="text-[11px] font-medium text-[#71717A] block mb-0.5">
                      Category
                    </label>
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
                      className="w-full bg-transparent border-b border-[#18181B] pb-0.5 pt-0.5 text-[14px] font-semibold text-[#18181B] focus:outline-none cursor-pointer"
                    >
                      <option value="Retail & Grocery">Retail & Grocery</option>
                      <option value="Sari-Sari Store">Sari-Sari Store</option>
                      <option value="Supermarket & Convenience">Supermarket & Convenience</option>
                      <option value="Bakery & Food Stand">Bakery & Food Stand</option>
                      <option value="Wholesale & Distribution">Wholesale & Distribution</option>
                      <option value="General Merchandising">General Merchandising</option>
                    </select>
                  </div>
                  <div className="shrink-0 pt-3">
                    <button
                      type="button"
                      onClick={() => setEditingField(null)}
                      className="px-2.5 py-1 text-[12px] font-medium text-[#71717A] hover:text-[#18181B] rounded-md hover:bg-[#F4F4F5] transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11.5px] font-medium text-[#71717A] block">
                      Category
                    </span>
                    <span className="text-[14px] font-semibold text-[#18181B] truncate block mt-0.5">
                      {formData.businessType || 'Retail & Grocery'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingField('businessType')}
                    className="text-[12.5px] font-medium text-[#71717A] hover:text-[#18181B] px-2.5 py-1 rounded-lg hover:bg-[#F4F4F5] active:scale-95 transition-all cursor-pointer shrink-0"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>

            {/* 4. Tax Identification Number (TIN) Row - Strict 12-Digit Limit & Seamless Inline Edit */}
            <div className="py-3">
              {editingField === 'tinNumber' ? (
                <div>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <label className="text-[11px] font-medium text-[#71717A] truncate">
                        TIN Number
                      </label>
                      <span className={`text-[10px] font-mono ${tempValue.replace(/\D/g, '').length >= 12 ? 'text-[#18181B] font-semibold' : 'text-[#71717A]'}`}>
                        ({tempValue.replace(/\D/g, '').length}/12 max)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingField(null)}
                        className="px-2 py-1 text-[12px] font-medium text-[#71717A] hover:text-[#18181B] rounded-md hover:bg-[#F4F4F5] transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveField('tinNumber')}
                        className="px-3 py-1 bg-[#18181B] hover:bg-[#27272A] text-white text-[12px] font-semibold rounded-md shadow-xs active:scale-95 transition-all cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      maxLength={15}
                      value={tempValue}
                      onChange={(e) => {
                        // Strictly limit raw digits to maximum 12 digits
                        const inputDigits = e.target.value.replace(/\D/g, '').slice(0, 12);
                        setTempValue(formatTINInput(inputDigits));
                      }}
                      onKeyDown={(e) => {
                        // Prevent entering more numbers once limit of 12 digits is reached
                        const currentDigits = tempValue.replace(/\D/g, '');
                        const isDigit = /^\d$/.test(e.key);
                        const hasSelection = typeof window !== 'undefined' && !!window.getSelection()?.toString();
                        if (isDigit && currentDigits.length >= 12 && !hasSelection) {
                          e.preventDefault();
                          return;
                        }
                        if (e.key === 'Enter') handleSaveField('tinNumber');
                        if (e.key === 'Escape') setEditingField(null);
                      }}
                      className="w-full bg-transparent border-b border-[#18181B] pb-1 pt-0.5 text-[14px] font-semibold font-mono tracking-wide text-[#18181B] focus:outline-none placeholder:text-[#A1A1AA]"
                      placeholder="000-000-000-000"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10.5px] text-[#71717A] mt-1.5">
                    <span>9 to 12 digits (e.g. 123-456-789-000)</span>
                    {tempValue.trim() && (
                      <button
                        type="button"
                        onClick={() => setTempValue('')}
                        className="text-[#71717A] hover:text-[#DC2626] transition-colors cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11.5px] font-medium text-[#71717A] block">
                      Tax Identification Number (TIN)
                    </span>
                    {formData.tinNumber ? (
                      <span className="text-[14px] font-semibold text-[#18181B] font-mono tracking-tight truncate block mt-0.5">
                        {formData.tinNumber}
                      </span>
                    ) : (
                      <span className="text-[13px] font-normal text-[#A1A1AA] italic block mt-0.5">
                        Not set
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStartEdit('tinNumber')}
                    className="text-[12.5px] font-medium text-[#71717A] hover:text-[#18181B] px-2.5 py-1 rounded-lg hover:bg-[#F4F4F5] active:scale-95 transition-all cursor-pointer shrink-0"
                  >
                    {formData.tinNumber ? 'Edit' : 'Add'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* System Storage Container */}
        <div>
          <p className="text-[12px] font-semibold text-[#71717A] px-1 mb-1.5">
            Storage
          </p>
          <div className="bg-white border border-[#E4E4E7] rounded-2xl px-4 py-3 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <HardDrive size={16} className="text-[#71717A]" />
              <span className="text-[13.5px] text-[#71717A]">Database</span>
            </div>
            <span className="text-[13px] font-semibold text-[#18181B]">
              Local and offline
            </span>
          </div>
        </div>

        {/* Backup & Tools */}
        <div>
          <p className="text-[12px] font-semibold text-[#71717A] px-1 mb-1.5">
            Backups
          </p>

          <div className="grid grid-cols-3 gap-2">
            {/* Export Button */}
            <button
              type="button"
              onClick={handleExportBackup}
              disabled={isExporting}
              className="p-3 bg-white hover:bg-[#FAFAFA] border border-[#E4E4E7] hover:border-[#D4D4D8] rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-[0.98] disabled:opacity-60"
            >
              <div className="w-8 h-8 rounded-full bg-[#F4F4F5] text-[#18181B] flex items-center justify-center">
                {isExporting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} strokeWidth={2.2} />
                )}
              </div>
              <span className="text-[12px] font-semibold text-[#18181B] leading-tight">
                Export
              </span>
            </button>

            {/* Restore Button */}
            <button
              type="button"
              onClick={() => restoreFileInputRef.current?.click()}
              disabled={isRestoring}
              className="p-3 bg-white hover:bg-[#FAFAFA] border border-[#E4E4E7] hover:border-[#D4D4D8] rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-[0.98] disabled:opacity-60"
            >
              <div className="w-8 h-8 rounded-full bg-[#F4F4F5] text-[#18181B] flex items-center justify-center">
                {isRestoring ? (
                  <Upload size={16} strokeWidth={2.2} />
                ) : (
                  <Upload size={16} strokeWidth={2.2} />
                )}
              </div>
              <span className="text-[12px] font-semibold text-[#18181B] leading-tight">
                Restore
              </span>
            </button>

            {/* Storage Health Button */}
            <button
              type="button"
              onClick={() => setShowHealthModal(true)}
              className="p-3 bg-white hover:bg-[#FAFAFA] border border-[#E4E4E7] hover:border-[#D4D4D8] rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
            >
              <div className="w-8 h-8 rounded-full bg-[#F4F4F5] text-[#18181B] flex items-center justify-center">
                <ShieldCheck size={16} strokeWidth={2.2} />
              </div>
              <span className="text-[12px] font-semibold text-[#18181B] leading-tight">
                Health
              </span>
            </button>
          </div>

          {/* Pending Restore Preview */}
          {pendingRestore && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-2.5 p-3.5 bg-white border border-[#E4E4E7] rounded-2xl shadow-xs space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className="text-[#D97706]" />
                  <span className="text-[13px] font-semibold text-[#18181B] truncate">
                    {pendingRestore.storeName}
                  </span>
                </div>
                <span className="text-[11px] text-[#71717A]">
                  {pendingRestore.productCount} items · {pendingRestore.salesCount} sales
                </span>
              </div>

              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setPendingRestore(null)}
                  disabled={isRestoring}
                  className="flex-1 py-1.5 rounded-xl border border-[#E4E4E7] text-[12px] font-medium text-[#18181B] hover:bg-[#F4F4F5] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setShowRestoreBackupReminder(true)}
                  disabled={isRestoring}
                  className="flex-1 py-1.5 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-white text-[12px] font-semibold transition-colors cursor-pointer shadow-xs flex items-center justify-center gap-1"
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
              className="w-full py-2.5 rounded-xl text-[13px] font-medium text-[#DC2626] hover:bg-red-50/70 border border-transparent hover:border-red-100 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
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
