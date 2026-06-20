/**
 * SubTabs — horizontal sub-navigation primitive.
 *
 * Covers:
 *   - Default pane renders its body
 *   - Clicking a tab switches the active body
 *   - Badge renders when non-zero / hides when 0
 *   - Icon renders when supplied
 *   - Returns null when no panes are supplied
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SubTabs, type SubTabPane } from '../components/SubTabs'

const panes: SubTabPane[] = [
  { id: 'buyer',  label: 'Buyer',  body: <div>BUYER_BODY</div>,  badge: 3 },
  { id: 'seller', label: 'Seller', body: <div>SELLER_BODY</div>, badge: 0 },
  { id: 'vehicle', label: 'Vehicle', icon: <span data-testid="car-icon" />, body: <div>VEHICLE_BODY</div> },
]

describe('SubTabs', () => {
  it('renders the first pane body by default', () => {
    render(<SubTabs panes={panes} />)
    expect(screen.getByText('BUYER_BODY')).toBeInTheDocument()
    expect(screen.queryByText('SELLER_BODY')).not.toBeInTheDocument()
  })

  it('uses defaultId to pick the starting pane', () => {
    render(<SubTabs panes={panes} defaultId="seller" />)
    expect(screen.getByText('SELLER_BODY')).toBeInTheDocument()
    expect(screen.queryByText('BUYER_BODY')).not.toBeInTheDocument()
  })

  it('switches to a different pane when its tab is clicked', async () => {
    render(<SubTabs panes={panes} />)
    await userEvent.click(screen.getByRole('button', { name: /vehicle/i }))
    expect(screen.getByText('VEHICLE_BODY')).toBeInTheDocument()
    expect(screen.queryByText('BUYER_BODY')).not.toBeInTheDocument()
  })

  it('renders a badge when provided + non-zero', () => {
    render(<SubTabs panes={panes} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('hides the badge when 0', () => {
    render(<SubTabs panes={panes} defaultId="seller" />)
    // Seller pane has badge: 0 — should not render a badge element with "0"
    // (the Buyer pane still has a "3" badge in the tab list)
    const sellerTab = screen.getByRole('button', { name: /seller/i })
    expect(sellerTab.textContent).not.toMatch(/\b0\b/)
  })

  it('renders the icon when supplied', () => {
    render(<SubTabs panes={panes} />)
    expect(screen.getByTestId('car-icon')).toBeInTheDocument()
  })

  it('renders nothing when panes is empty', () => {
    const { container } = render(<SubTabs panes={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('falls back to the first pane when defaultId does not match', () => {
    render(<SubTabs panes={panes} defaultId="nope" />)
    expect(screen.getByText('BUYER_BODY')).toBeInTheDocument()
  })
})
