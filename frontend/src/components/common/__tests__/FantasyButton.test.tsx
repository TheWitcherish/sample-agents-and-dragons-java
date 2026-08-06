import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FantasyButton from '../FantasyButton';

describe('FantasyButton', () => {
  it('renders children text', () => {
    render(<FantasyButton>Click Me</FantasyButton>);
    expect(screen.getByRole('button', { name: 'Click Me' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<FantasyButton onClick={handleClick}>Go</FantasyButton>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', () => {
    const handleClick = vi.fn();
    render(<FantasyButton onClick={handleClick} disabled>Go</FantasyButton>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('has disabled attribute when disabled prop is true', () => {
    render(<FantasyButton disabled>Go</FantasyButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('defaults to type="button"', () => {
    render(<FantasyButton>Go</FantasyButton>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('supports type="submit"', () => {
    render(<FantasyButton type="submit">Submit</FantasyButton>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('applies "normal" class by default', () => {
    render(<FantasyButton>Go</FantasyButton>);
    expect(screen.getByRole('button')).toHaveClass('fantasy-button', 'normal');
  });

  it('applies "large" class when large prop is true', () => {
    render(<FantasyButton large>Go</FantasyButton>);
    expect(screen.getByRole('button')).toHaveClass('fantasy-button', 'large');
  });

  it('size prop takes precedence over large prop', () => {
    render(<FantasyButton size="small" large>Go</FantasyButton>);
    expect(screen.getByRole('button')).toHaveClass('fantasy-button', 'small');
  });

  it('applies size class from size prop', () => {
    render(<FantasyButton size="large">Go</FantasyButton>);
    expect(screen.getByRole('button')).toHaveClass('large');
  });
});
