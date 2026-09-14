"use client";

import React, { useState, useEffect } from "react";
import { Search, Filter, Eye, UserX, Trash2, Check, X, ShieldAlert, AlertTriangle } from "lucide-react";
import AdminBadge from "@/components/admin/AdminBadge";
import AdminModal from "@/components/admin/AdminModal";
import AdminPagination from "@/components/admin/AdminPagination";
import type { SafeUser as UserAccount } from "@/lib/repositories/users";


const ITEMS_PER_PAGE = 12;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  const [userToSuspend, setUserToSuspend] = useState<UserAccount | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);
  const [notification, setNotification] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const refreshUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.data)) {
        setUsers(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch admin users:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUsers();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  const filteredUsers = users.filter((u) => {
    const term = search.toLowerCase();
    const matchesSearch =
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      u.phone.includes(term);

    const matchesStatus =
      statusFilter === "all" || u.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE) || 1;
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const confirmSuspendUser = async () => {
    if (!userToSuspend) return;
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userToSuspend.id, action: "suspend" }),
      });
      const data = await res.json();
      if (data.success) {
        setNotification(`User account for "${userToSuspend.name}" has been suspended.`);
        refreshUsers();
      } else {
        setNotification(`Error: ${data.error || "Failed to suspend user"}`);
      }
    } catch {
      setNotification("Failed to suspend user account.");
    }
    setUserToSuspend(null);
    setTimeout(() => setNotification(""), 4000);
  };

  const confirmSoftDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      const res = await fetch(`/api/admin/users?id=${encodeURIComponent(userToDelete.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setNotification(`User account "${userToDelete.name}" soft-deleted.`);
        refreshUsers();
      } else {
        setNotification(`Error: ${data.error || "Failed to delete user"}`);
      }
    } catch {
      setNotification("Failed to delete user account.");
    }
    setUserToDelete(null);
    setTimeout(() => setNotification(""), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Users</h1>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            Manage registered users, suspend or soft-delete customer accounts.
          </p>
        </div>
      </div>

      {notification && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs md:text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check size={18} className="text-emerald-600" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification("")} className="text-emerald-600 hover:text-emerald-900">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 md:p-5 shadow-2xs flex flex-col md:flex-row items-center gap-4 justify-between">
        <div className="flex items-center gap-3 w-full md:w-auto flex-1">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users..."
              className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-4 py-2.5 text-xs md:text-sm text-slate-800 font-medium focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
            />
          </div>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm font-bold text-slate-800 focus:outline-hidden focus:border-red-500 cursor-pointer"
          >
            <option value="all">All Users</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>

        <button className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs md:text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors w-full md:w-auto justify-center">
          <Filter size={16} /> Filter
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-extrabold text-slate-500 uppercase tracking-wider bg-slate-50/60">
                <th className="py-4 px-4 w-10">
                  <input type="checkbox" className="rounded-xs border-slate-300 text-red-600 focus:ring-red-500" />
                </th>
                <th className="py-4 px-4">Name</th>
                <th className="py-4 px-4">Email</th>
                <th className="py-4 px-4">Phone</th>
                <th className="py-4 px-4">Status</th>
                <th className="py-4 px-4">Joined</th>
                <th className="py-4 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-semibold">
                    <div className="w-8 h-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin mx-auto mb-2" />
                    <span>Loading user accounts...</span>
                  </td>
                </tr>
              ) : paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-semibold">
                    No users found.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((u) => {
                  const initial = u.name ? u.name.charAt(0).toUpperCase() : "U";
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-4">
                        <input type="checkbox" className="rounded-xs border-slate-300 text-red-600 focus:ring-red-500" />
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-900 text-white font-black text-sm flex items-center justify-center shrink-0">
                            {initial}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block leading-tight">{u.name}</span>
                            {u.company && <span className="text-xs text-slate-400 block">{u.company}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono text-xs md:text-sm text-slate-600">{u.email}</td>
                      <td className="py-4 px-4 font-mono text-xs md:text-sm text-slate-600">{u.phone}</td>
                      <td className="py-4 px-4">
                        {u.status === "ACTIVE" && <AdminBadge variant="success">Active</AdminBadge>}
                        {u.status === "SUSPENDED" && <AdminBadge variant="warning">Suspended</AdminBadge>}
                        {u.status === "DELETED" && <AdminBadge variant="neutral">Deleted</AdminBadge>}
                      </td>


                      <td className="py-4 px-4 text-slate-500 font-semibold">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "12 Aug 2026"}
                      </td>

                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedUser(u)}
                            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="View user details"
                          >
                            <Eye size={16} />
                          </button>
                          {u.status === "ACTIVE" && (

                            <button
                              onClick={() => setUserToSuspend(u)}
                              className="p-2 rounded-xl text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                              title="Suspend user account"
                            >
                              <UserX size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => setUserToDelete(u)}
                            className="p-2 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Soft delete user"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Global Reusable Pagination */}
        <AdminPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={(page) => setCurrentPage(page)}
          totalItems={filteredUsers.length}
          itemsPerPage={ITEMS_PER_PAGE}
          itemLabel="users"
        />
      </div>

      {/* View User Modal */}
      {selectedUser && (
        <AdminModal
          isOpen={Boolean(selectedUser)}
          onClose={() => setSelectedUser(null)}
          title="User Account Information"
        >
          <div className="space-y-4 text-xs md:text-sm">
            <div className="flex items-center gap-4 pb-4 border-b border-slate-200">
              <div className="w-12 h-12 rounded-full bg-slate-900 text-white font-black text-lg flex items-center justify-center shrink-0">
                {selectedUser.name.charAt(0)}
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">{selectedUser.name}</h3>
                <span className="text-slate-500 font-semibold">{selectedUser.company || "Individual Account"}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-slate-400 block font-semibold text-xs">Email</span>
                <span className="font-bold text-slate-800 font-mono">{selectedUser.email}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold text-xs">Phone</span>
                <span className="font-bold text-slate-800 font-mono">{selectedUser.phone}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold text-xs">Account Status</span>
                <span className="font-bold text-slate-800">{selectedUser.status}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold text-xs">Joined Date</span>
                <span className="font-bold text-slate-800">
                  {selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : ""}
                </span>
              </div>

            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-5 py-2.5 bg-slate-900 text-white font-bold text-xs md:text-sm rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {/* Suspend Confirmation Modal */}
      {userToSuspend && (
        <AdminModal
          isOpen={Boolean(userToSuspend)}
          onClose={() => setUserToSuspend(null)}
          title="Confirm Suspend User"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs md:text-sm font-semibold flex items-center gap-3">
              <ShieldAlert size={22} className="shrink-0 text-amber-600" />
              <span>Suspend user account for <strong>{userToSuspend.name}</strong>?</span>
            </div>
            <p className="text-xs md:text-sm text-slate-500 leading-relaxed">
              This will disable active account privileges in the system.
            </p>
            <div className="pt-4 flex justify-end gap-3 border-t border-slate-200">
              <button
                onClick={() => setUserToSuspend(null)}
                className="px-4 py-2 text-xs md:text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={confirmSuspendUser}
                className="px-5 py-2 text-xs md:text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm"
              >
                Suspend User
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {/* Soft Delete Confirmation Modal */}
      {userToDelete && (
        <AdminModal
          isOpen={Boolean(userToDelete)}
          onClose={() => setUserToDelete(null)}
          title="Confirm Soft Delete User"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs md:text-sm font-semibold flex items-center gap-3">
              <AlertTriangle size={22} className="shrink-0 text-rose-600" />
              <span>Soft-delete account for <strong>{userToDelete.name}</strong>?</span>
            </div>
            <p className="text-xs md:text-sm text-slate-500 leading-relaxed">
              This user will be marked as soft-deleted (`Deleted`). The record is preserved in the database.
            </p>
            <div className="pt-4 flex justify-end gap-3 border-t border-slate-200">
              <button
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 text-xs md:text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={confirmSoftDeleteUser}
                className="px-5 py-2 text-xs md:text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm"
              >
                Soft Delete User
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
