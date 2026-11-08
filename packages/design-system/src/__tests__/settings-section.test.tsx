import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SettingsSection } from '../components/settings-section.js';

describe('SettingsSection', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders title correctly', () => {
    render(
      <SettingsSection title="General Settings">
        <div>Content</div>
      </SettingsSection>,
    );

    expect(screen.getByText('General Settings')).toBeInTheDocument();
  });

  it('uses the heading type role for the section title', () => {
    render(
      <SettingsSection title="Library Settings">
        <div>Content</div>
      </SettingsSection>,
    );

    const title = screen.getByRole('heading', { name: 'Library Settings' });
    expect(title).toHaveClass('type-heading');
    expect(title).not.toHaveClass('type-title');
  });

  it('renders children correctly', () => {
    render(
      <SettingsSection title="Settings">
        <p>Child content</p>
      </SettingsSection>,
    );

    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('displays description when provided', () => {
    render(
      <SettingsSection title="Settings" description="This is a description">
        <div>Content</div>
      </SettingsSection>,
    );

    expect(screen.getByText('This is a description')).toBeInTheDocument();
  });

  it('does not display description when not provided', () => {
    render(
      <SettingsSection title="Settings">
        <div>Content</div>
      </SettingsSection>,
    );

    expect(screen.queryByText(/description/i)).not.toBeInTheDocument();
  });

  it('applies danger styling when danger prop is true', () => {
    const { container } = render(
      <SettingsSection title="Danger Zone" danger>
        <div>Content</div>
      </SettingsSection>,
    );

    expect(container.querySelector('.border-destructive\\/40')).toBeTruthy();
  });

  it('does not apply danger styling when danger prop is false', () => {
    const { container } = render(
      <SettingsSection title="Normal Section" danger={false}>
        <div>Content</div>
      </SettingsSection>,
    );

    expect(container.querySelector('.border-destructive\\/40')).toBeNull();
  });

  it('has proper accessibility attributes', () => {
    render(
      <SettingsSection title="Accessible Section">
        <div>Content</div>
      </SettingsSection>,
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded');
  });

  it('applies danger text color to title when danger prop is true', () => {
    render(
      <SettingsSection title="Danger Zone" danger>
        <div>Content</div>
      </SettingsSection>,
    );

    const title = screen.getByText('Danger Zone');
    expect(title).toHaveClass('text-destructive');
  });

  it('renders collapsed when collapsed prop is true', () => {
    render(
      <SettingsSection title="Collapsed Section" collapsed>
        <div>Hidden content</div>
      </SettingsSection>,
    );

    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('Given a collapsed section, When it is opened and closed, Then the body mounts once, eases via data-open and is inert while closed', () => {
    render(
      <SettingsSection title="Folding" collapsed>
        <button type="button">Inside</button>
      </SettingsSection>,
    );
    const toggle = screen.getByRole('button', { name: 'Folding' });
    expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    const inside = screen.getByRole('button', { name: 'Inside' });
    const region = inside.closest('[data-open]')!;
    expect(region).toHaveAttribute('data-open', 'true');
    expect(inside.closest('[inert]')).toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    // Still mounted so the height can ease down, but out of the tab order and the a11y tree.
    expect(screen.getByRole('button', { name: 'Inside', hidden: true })).toBe(inside);
    expect(region).toHaveAttribute('data-open', 'false');
    expect(inside.closest('[inert]')).not.toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('children are visible by default when not collapsed', () => {
    render(
      <SettingsSection title="Expanded Section">
        <div>Visible content</div>
      </SettingsSection>,
    );

    expect(screen.getByText('Visible content')).toBeInTheDocument();
  });

  it('shows chevron icons when collapsed prop is true', () => {
    render(
      <SettingsSection title="Section with Chevron" collapsed>
        <div>Content</div>
      </SettingsSection>,
    );

    const svgElements = document.querySelectorAll('svg');
    expect(svgElements.length).toBeGreaterThan(0);
  });
});
