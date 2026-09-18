import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  User,
  Store,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  CheckCircle2,
  Edit2,
  Building2,
  Trash2,
} from 'lucide-react';
import { UserProfile } from '../types';

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
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [formData, setFormData] = useState<UserProfile>(profile);
  const [confirmResetData, setConfirmResetData] = useState(false);

  // Sync formData if profile prop updates externally
  React.useEffect(() => {
    setFormData(profile);
  }, [profile]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateProfile) {
      onUpdateProfile(formData);
    }
    setIsEditing(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
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
      {/* Profile Subtitle & Action Bar */}
      <div className="mb-5 flex items-center justify-between">
        <p
          id="profile-subtitle"
          className="text-[13.5px] font-medium text-[#68716C]"
        >
          Store account & business details
        </p>

        <button
          id="edit-profile-button"
          type="button"
          onClick={() => setIsEditing(!isEditing)}
          className="px-3.5 py-1.5 rounded-full border border-[#E1E6E2] bg-white hover:bg-[#F4F6F4] text-[13px] font-medium text-[#202522] flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
        >
          <Edit2 size={14} className="text-[#68716C]" />
          {isEditing ? 'Cancel' : 'Edit Profile'}
        </button>
      </div>

      {/* Success Notification Banner */}
      {savedSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="mb-4 p-3.5 bg-[#E8F3E8] border border-[#81B783] rounded-xl flex items-center gap-2 text-[#2F7D32] text-[13px] font-medium"
        >
          <CheckCircle2 size={16} />
          Profile updated successfully!
        </motion.div>
      )}

      {/* Profile Card */}
      <div className="bg-white border border-[#E1E6E2] rounded-2xl p-5 mb-5 shadow-[0_2px_8px_rgba(32,37,34,0.02)] relative overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#E8F3E8] border border-[#81B783] flex items-center justify-center text-[#2F7D32] flex-shrink-0 shadow-2xs relative">
            <User size={30} strokeWidth={1.8} />
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-[#2F7D32] border-2 border-white rounded-full flex items-center justify-center z-10">
              <CheckCircle2 size={12} className="text-white" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[20px] font-bold text-[#202522] truncate">
                {formData.ownerName}
              </h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#E8F3E8] text-[#2F7D32] flex-shrink-0">
                Verified Owner
              </span>
            </div>
            <p className="text-[14px] font-medium text-[#68716C] mt-0.5 flex items-center gap-1 truncate">
              <Store size={14} className="text-[#68716C]/70 flex-shrink-0" />
              {formData.storeName}
            </p>
            <p className="text-[12px] text-[#68716C]/80 mt-1 flex items-center gap-1">
              <ShieldCheck size={13} className="text-[#2F7D32]" />
              Store ID: <span className="font-mono text-[11px] font-semibold text-[#202522]">SAGE-8921-PH</span>
            </p>
          </div>
        </div>
      </div>

      {/* Editable Form / Display View */}
      {isEditing ? (
        <form onSubmit={handleSave} className="bg-white border border-[#E1E6E2] rounded-2xl p-5 mb-5 space-y-4 shadow-[0_2px_8px_rgba(32,37,34,0.02)]">
          <div className="flex items-center justify-between border-b border-[#E1E6E2] pb-3 mb-1">
            <h3 className="text-[17px] font-bold text-[#202522]">Edit Profile Details</h3>
            <span className="text-[12px] text-[#68716C]">Update store & account</span>
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
