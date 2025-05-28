import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RothIRACalculator from '../components/RothIRACalculator'

describe('RothIRACalculator', () => {
  beforeEach(() => {
    render(<RothIRACalculator />)
  })

  it('renders initial stocks', () => {
    expect(screen.getByText(/VTSAX/i)).toBeInTheDocument()
    expect(screen.getByText(/VOO/i)).toBeInTheDocument()
  })

  it('allows adding a new stock', async () => {
    const input = screen.getByPlaceholderText(/enter stock symbol/i)
    const addButton = screen.getByText(/add/i)

    await userEvent.type(input, 'AAPL')
    await userEvent.click(addButton)

    expect(screen.getByText(/AAPL/i)).toBeInTheDocument()
  })

  it('shows error when percentages do not add up to 100', async () => {
    const amountInput = screen.getByPlaceholderText(/enter amount/i)
    const inputs = screen.getAllByRole('spinbutton')
    const vtsaxInput = inputs[1] // First percentage input
    const vooInput = inputs[2] // Second percentage input

    await userEvent.type(amountInput, '1000')
    await userEvent.clear(vtsaxInput)
    await userEvent.type(vtsaxInput, '50')
    await userEvent.clear(vooInput)
    await userEvent.type(vooInput, '30')

    expect(screen.getByText(/percentages must add up to 100%/i)).toBeInTheDocument()
  })

  it('calculates allocations correctly', async () => {
    const amountInput = screen.getByPlaceholderText(/enter amount/i)
    const inputs = screen.getAllByRole('spinbutton')
    const vtsaxInput = inputs[1] // First percentage input
    const vooInput = inputs[2] // Second percentage input

    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '1000')
    await userEvent.clear(vtsaxInput)
    await userEvent.type(vtsaxInput, '60')
    await userEvent.clear(vooInput)
    await userEvent.type(vooInput, '40')

    expect(screen.getByText(/\$600\.00/)).toBeInTheDocument()
    expect(screen.getByText(/\$400\.00/)).toBeInTheDocument()
  })

  it('validates input amount', async () => {
    const amountInput = screen.getByPlaceholderText(/enter amount/i)
    
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '-1000')

    expect(screen.getByText(/please enter a valid positive number/i)).toBeInTheDocument()
  })

  it('removes a stock when delete button is clicked', async () => {
    const deleteButton = screen.getAllByRole('button', { name: /remove stock/i })[0]
    
    await userEvent.click(deleteButton)
    
    expect(screen.queryByText(/VTSAX/i)).not.toBeInTheDocument()
  })

  it('sanitizes user input for stock symbols', async () => {
    const input = screen.getByPlaceholderText(/enter stock symbol/i)
    const addButton = screen.getByText(/add/i)

    await userEvent.type(input, '<script>alert("xss")</script>')
    await userEvent.click(addButton)

    const addedStock = screen.getByText(/<SCRIPT>ALERT\("XSS"\)<\/SCRIPT>/i)
    expect(addedStock).toBeInTheDocument()
    // The text is rendered safely as content, not interpreted as HTML
    expect(addedStock.innerHTML).not.toContain('<script>')
  })
})
