import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  User,
  Store,
  Mail,
  Phone,
  MapPin,
  Edit2,
  Building2,
  Trash2,
  Camera,
  Loader2,
} from 'lucide-react';
import { UserProfile } from '../types';
import {
  saveProfileImage,
  deleteProfileImage,
  getProfileImage,
} from '../utils/imageStorage';

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
  const [isEditing, setIsEditing] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [formData, setFormData] = useState<UserProfile>(profile);
  const [confirmResetData, setConfirmResetData] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync formData if profile prop updates externally
  useEffect(() => {
    setFormData(profile);
  }, [profile]);

  // Load offline profile image if not yet attached to profile
  useEffect(() => {
    if (!formData.avatarUrl) {
      getProfileImage().then((avatar) => {
        if (avatar) {
          setFormData((prev) => ({ ...prev, avatarUrl: avatar }));
        }
      }).catch(() => {});
    }
  }, []);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPEG, WebP, etc.)');
      return;
    }

    try {
      setIsUploadingPhoto(true);
      // Compresses client-side using HTML5 Canvas and saves directly on phone storage (IndexedDB)
      const dataUrl = await saveProfileImage(file);
      const updated: UserProfile = {
        ...formData,
        avatarUrl: dataUrl,
      };
      setFormData(updated);
      if (onUpdateProfile) {
        onUpdateProfile(updated);
      }
    } catch (err) {
      console.error('Failed to save profile photo to phone storage:', err);
      alert('Failed to process image. Please try another photo.');
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = async () => {
    try {
      setIsUploadingPhoto(true);
      // Remove immediately from device IndexedDB to eliminate storage churn
      await deleteProfileImage();
      const updated: UserProfile = {
        ...formData,
        avatarUrl: undefined,
      };
      setFormData(updated);
      if (onUpdateProfile) {
        onUpdateProfile(updated);
      }
    } catch (err) {
      console.error('Failed to remove profile photo from IDB:', err);
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateProfile) {
      onUpdateProfile(formData);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData(profile);
    setIsEditing(false);
  };

  return (
    <motion.div
      id="profile-screen-view"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="w-full max-w-[430px] mx-auto px-5 pt-3 sm:pt-4"
      style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Hidden File Input for Phone Photo Selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handlePhotoUpload}
        className="hidden"
        aria-hidden="true"
      />

      {/* Profile Card with User Avatar, Name, Store, and Edit Pen */}
      <div className="bg-white border border-[#E1E6E2] rounded-2xl p-5 mb-5 shadow-[0_2px_8px_rgba(32,37,34,0.02)] relative">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            {/* Interactive Profile Avatar */}
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPhoto}
                title="Change profile photo (stored on phone)"
                aria-label="Upload profile photo"
                className="w-14 h-14 rounded-full bg-[#E8F3E8] border border-[#81B783] overflow-hidden flex items-center justify-center text-[#2F7D32] shadow-2xs cursor-pointer hover:opacity-95 transition-all group relative focus:outline-none"
              >
                {formData.avatarUrl ? (
                  <img
                    src={formData.avatarUrl}
                    alt={formData.ownerName}
                    className="w-full h-full object-cover select-none"
                  />
                ) : (
                  <User size={28} strokeWidth={1.8} />
                )}

                {/* Hover tint indicating tap to upload */}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera size={16} className="text-white" />
                </div>
              </button>

              {/* Camera icon badge */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPhoto}
                aria-label="Upload profile photo"
                className="absolute -bottom-1 -right-1 w-5.5 h-5.5 rounded-full bg-[#2F7D32] hover:bg-[#25632A] text-white flex items-center justify-center shadow-xs border-2 border-white transition-colors cursor-pointer"
              >
                {isUploadingPhoto ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Camera size={11} strokeWidth={2.4} />
                )}
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-[19px] font-bold text-[#202522] truncate">
                {formData.ownerName}
              </h2>
              <p className="text-[14px] font-medium text-[#68716C] mt-0.5 flex items-center gap-1.5 truncate">
                <Store size={15} className="text-[#68716C] flex-shrink-0" />
                <span>{formData.storeName}</span>
              </p>
            </div>
          </div>

          {/* Pen for editing profile inside the container with user's name */}
          <button
            id="edit-profile-button"
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            aria-label={isEditing ? 'Cancel editing' : 'Edit profile'}
            className="w-9 h-9 rounded-full border border-[#E1E6E2] bg-white hover:bg-[#F4F6F4] text-[#202522] flex items-center justify-center shadow-2xs cursor-pointer transition-colors flex-shrink-0 active:scale-95"
          >
            <Edit2 size={15} className="text-[#68716C]" />
          </button>
        </div>
      </div>

      {/* Editable Form / Display View */}
      {isEditing ? (
        <form onSubmit={handleSave} className="bg-white border border-[#E1E6E2] rounded-2xl p-5 mb-5 space-y-4 shadow-[0_2px_8px_rgba(32,37,34,0.02)]">
          <div className="flex items-center justify-between border-b border-[#E1E6E2] pb-3 mb-1">
            <h3 className="text-[17px] font-bold text-[#202522]">Edit Profile Details</h3>
            <span className="text-[12px] text-[#68716C]">Update store & account</span>
          </div>

          {/* Profile Photo Controls Inside Form */}
          <div className="flex items-center gap-3.5 pb-3 border-b border-[#E1E6E2]">
            <div className="w-14 h-14 rounded-full bg-[#E8F3E8] border border-[#81B783] overflow-hidden flex items-center justify-center text-[#2F7D32] shadow-2xs flex-shrink-0">
              {formData.avatarUrl ? (
                <img
                  src={formData.avatarUrl}
                  alt={formData.ownerName}
                  className="w-full h-full object-cover select-none"
                />
              ) : (
                <User size={28} strokeWidth={1.8} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                  className="px-3 py-1.5 rounded-xl border border-[#E1E6E2] bg-white hover:bg-[#F4F6F4] text-[12.5px] font-semibold text-[#202522] flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  {isUploadingPhoto ? (
                    <Loader2 size={13} className="animate-spin text-[#2F7D32]" />
                  ) : (
                    <Camera size={13} className="text-[#2F7D32]" />
                  )}
                  <span>{formData.avatarUrl ? 'Change photo' : 'Upload photo'}</span>
                </button>
                {formData.avatarUrl && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={isUploadingPhoto}
                    className="px-2.5 py-1.5 rounded-xl border border-[#E1E6E2] bg-white hover:bg-red-50 text-[12px] font-medium text-red-600 flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Trash2 size={13} />
                    <span>Remove</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-[#68716C] mt-1">
                Stored offline on your phone
              </p>
            </div>
          </div>
          
          <div>
            <label className="block text-[12px] font-medium text-[#68716C] mb-1">Owner Name</label>
            <input
              type="text"
              value={formData.ownerName}
              onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E1E6E2] text-[14px] text-[#202522] focus:outline-none focus:border-[#2F7D32] bg-[#FAFBFB] focus:bg-white transition-colors"
              placeholder="Full name"
              required
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#68716C] mb-1">Store Name</label>
            <input
              type="text"
              value={formData.storeName}
              onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E1E6E2] text-[14px] text-[#202522] focus:outline-none focus:border-[#2F7D32] bg-[#FAFBFB] focus:bg-white transition-colors"
              placeholder="Business or store name"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[#68716C] mb-1">Business Type</label>
              <select
                value={formData.businessType}
                onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E1E6E2] text-[14px] text-[#202522] focus:outline-none focus:border-[#2F7D32] bg-[#FAFBFB] focus:bg-white transition-colors cursor-pointer"
              >
                <option value="Retail & Grocery">Retail & Grocery</option>
                <option value="Sari-Sari Store">Sari-Sari Store</option>
                <option value="Supermarket & Convenience">Supermarket & Convenience</option>
                <option value="Bakery & Food Stand">Bakery & Food Stand</option>
                <option value="Wholesale & Distribution">Wholesale & Distribution</option>
                <option value="General Merchandising">General Merchandising</option>
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#68716C] mb-1">Currency</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E1E6E2] text-[14px] text-[#202522] focus:outline-none focus:border-[#2F7D32] bg-[#FAFBFB] focus:bg-white transition-colors cursor-pointer"
              >
                <option value="PHP (₱)">PHP (₱) - Philippine Peso</option>
                <option value="USD ($)">USD ($) - US Dollar</option>
                <option value="EUR (€)">EUR (€) - Euro</option>
                <option value="GBP (£)">GBP (£) - British Pound</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#68716C] mb-1">Email Address <span className="text-[#68716C]/70 font-normal">(Optional)</span></label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E1E6E2] text-[14px] text-[#202522] focus:outline-none focus:border-[#2F7D32] bg-[#FAFBFB] focus:bg-white transition-colors"
              placeholder="e.g. contact@email.com"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#68716C] mb-1">Phone Number <span className="text-[#68716C]/70 font-normal">(Optional)</span></label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E1E6E2] text-[14px] text-[#202522] focus:outline-none focus:border-[#2F7D32] bg-[#FAFBFB] focus:bg-white transition-colors"
              placeholder="e.g. +63 917 000 0000"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#68716C] mb-1">Business Address <span className="text-[#68716C]/70 font-normal">(Optional)</span></label>
            <textarea
              rows={2}
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-[#E1E6E2] text-[14px] text-[#202522] focus:outline-none focus:border-[#2F7D32] bg-[#FAFBFB] focus:bg-white transition-colors resize-none"
              placeholder="Store location / address"
            />
          </div>

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 py-2.5 border border-[#E1E6E2] bg-white text-[#202522] rounded-xl text-[14px] font-medium hover:bg-[#F4F6F4] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-[#2F7D32] text-white rounded-xl text-[14px] font-semibold hover:bg-[#256B29] active:bg-[#1E5A22] transition-colors cursor-pointer shadow-2xs"
            >
              Save Changes
            </button>
          </div>
        </form>
      ) : (
        /* Business Info & Clear Data Section */
        <div className="space-y-6">
          <section aria-label="Business Details">
            <h2 className="text-[15px] font-semibold text-[#202522] px-1 mb-2.5">
              Business Contact
            </h2>

            <div className="bg-white border border-[#E1E6E2] rounded-2xl divide-y divide-[#E1E6E2] overflow-hidden shadow-[0_2px_8px_rgba(32,37,34,0.02)]">
              <div className="p-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#FAFBFB] border border-[#E1E6E2] flex items-center justify-center text-[#68716C] flex-shrink-0">
                  <Building2 size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-[#68716C]">Business Type</p>
                  <p className="text-[14px] font-semibold text-[#202522] truncate">{formData.businessType}</p>
                </div>
              </div>

              <div className="p-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#FAFBFB] border border-[#E1E6E2] flex items-center justify-center text-[#68716C] flex-shrink-0">
                  <Mail size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-[#68716C]">Email</p>
                  <p className="text-[14px] font-medium text-[#202522] truncate">
                    {formData.email || <span className="text-[#68716C]/70 italic font-normal">Not set (Optional)</span>}
                  </p>
                </div>
              </div>

              <div className="p-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#FAFBFB] border border-[#E1E6E2] flex items-center justify-center text-[#68716C] flex-shrink-0">
                  <Phone size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-[#68716C]">Phone</p>
                  <p className="text-[14px] font-medium text-[#202522] truncate">
                    {formData.phone || <span className="text-[#68716C]/70 italic font-normal">Not set (Optional)</span>}
                  </p>
                </div>
              </div>

              <div className="p-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#FAFBFB] border border-[#E1E6E2] flex items-center justify-center text-[#68716C] flex-shrink-0">
                  <MapPin size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-[#68716C]">Address</p>
                  <p className="text-[14px] font-medium text-[#202522] truncate">
                    {formData.address || <span className="text-[#68716C]/70 italic font-normal">Not set (Optional)</span>}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Reset / Clear Data Option */}
          {onResetAllData && (
            <section aria-label="Danger Zone" className="pt-2">
              <div className="bg-white border border-[#E1E6E2] rounded-2xl p-4.5 shadow-[0_2px_8px_rgba(32,37,34,0.02)]">
                {!confirmResetData ? (
                  <button
                    id="clear-all-data-button"
                    type="button"
                    onClick={() => setConfirmResetData(true)}
                    className="w-full py-3 bg-white hover:bg-[#FDF0EE] border border-[#E1E6E2] hover:border-[#FADCDA] rounded-xl text-[#D94841] font-medium text-[14px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Trash2 size={16} />
                    <span>Clear All Data (Start Fresh)</span>
                  </button>
                ) : (
                  <div className="p-4 bg-[#FDF0EE] border border-[#FADCDA] rounded-xl text-center">
                    <p className="text-[13px] font-medium text-[#202522] mb-3">
                      Are you sure? This removes all products and sales, and returns to setup.
                    </p>
                    <div className="flex gap-2 justify-center">
                      <button
                        type="button"
                        onClick={() => setConfirmResetData(false)}
                        className="px-4 py-2 bg-white border border-[#E1E6E2] rounded-lg text-[13px] font-medium text-[#202522] hover:bg-[#FAFBFB] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onResetAllData();
                          setConfirmResetData(false);
                        }}
                        className="px-4 py-2 bg-[#D94841] text-white rounded-lg text-[13px] font-medium hover:bg-[#B83832] cursor-pointer"
                      >
                        Yes, Clear All
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </motion.div>
  );
};
