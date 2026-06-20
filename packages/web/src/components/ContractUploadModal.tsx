import { useState } from 'react'
import { X, Upload, AlertCircle } from 'lucide-react'
import { uploadContract } from '../lib/queries'
import type { ContractType } from '../types/database'

interface Props {
  dealId: string
  defaultType?: ContractType
  onClose: () => void
  onUploaded: () => void
}

const TYPE_OPTIONS: { value: ContractType; label: string }[] = [
  { value: 'BUYER_FINANCE_AGREEMENT', label: 'Buyer Finance Agreement (Claimtec ↔ Buyer)' },
  { value: 'SELLER_AGREEMENT',        label: 'Seller Agreement / OTP (Buyer ↔ Seller)' },
]

export function ContractUploadModal({ dealId, defaultType, onClose, onUploaded }: Props) {
  const [contractType, setContractType] = useState<ContractType>(defaultType ?? 'BUYER_FINANCE_AGREEMENT')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Choose a PDF file to upload')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await uploadContract({ dealId, contractType, file })
      onUploaded()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-800">Upload contract</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Contract type</label>
            <select
              value={contractType}
              onChange={(e) => setContractType(e.target.value as ContractType)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-claimtec-forest focus:outline-none"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">PDF file (max 20 MB)</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-claimtec-forest/5 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-claimtec-forest-2 hover:file:bg-claimtec-forest/10"
            />
            {file && (
              <p className="mt-1 text-xs text-gray-500">
                {file.name} — {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !file}
              className="inline-flex items-center gap-1.5 rounded-lg bg-claimtec-forest px-3 py-1.5 text-sm font-medium text-white hover:bg-claimtec-forest-2 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {busy ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
