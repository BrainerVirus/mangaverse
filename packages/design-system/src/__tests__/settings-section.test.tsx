import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SettingsSection } from '../components/settings-section.js';

describe('SettingsSection', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders title correctly', () => {
    render(<SettingsSection title="General Settings"><div>Content</div></SettingsSection>);

    expect(screen.getByText('General Settings')).toBeInTheDocument();
  });

  it('renders children correctly', () => {
    render(<SettingsSection title="Settings"><p>Child content</p></SettingsSection>);

    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('displays description when provided', () => {
    render(
      <SettingsSection
        title="Settings"
        description="This is a description"
      >
        <div>Content</div>
      </SettingsSection>
    );

    expect(screen.getByText('This is a description')).toBeInTheDocument();
  });

  it('does not display description when not provided', () => {
    render(<SettingsSection title="Settings"><div>Content</div></SettingsSection>);

    expect(screen.queryByText(/description/i)).not.toBeInTheDocument();
  });

  it('applies danger styling when danger prop is true', () => {
    const { container } = render(
      <SettingsSection title="Danger Zone" danger>
        <div>Content</div>
      </SettingsSection>
    );

    expect(container.firstChild).toHaveClass('border-destructive/40');
  });

  it('does not apply danger styling when danger prop is false', () => {
    const { container } = render(
      <SettingsSection title="Normal Section" danger={false}>
        <div>Content</div>
      </SettingsSection>
    );

    expect(container.firstChild).not.toHaveClass('border-destructive/50');
  });

  it('has proper accessibility attributes', () => {
    render(<SettingsSection title="Accessible Section"><div>Content</div></SettingsSection>);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded');
  });

  it('applies danger text color to title when danger prop is true', () => {
    render(
      <SettingsSection title="Danger Zone" danger>
        <div>Content</div>
      </SettingsSection>
    );

    const title = screen.getByText('Danger Zone');
    expect(title).toHaveClass('text-destructive');
  });

  it('renders collapsed when collapsed prop is true', () => {
    render(
      <SettingsSection title="Collapsed Section" collapsed>
        <div>Hidden content</div>
      </SettingsSection>
    );

    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('children are visible by default when not collapsed', () => {
    render(
      <SettingsSection title="Expanded Section">
        <div>Visible content</div>
      </SettingsSection>
    );

    expect(screen.getByText('Visible content')).toBeInTheDocument();
  });

  it('shows chevron icons when collapsed prop is true', () => {
    render(
      <SettingsSection title="Section with Chevron" collapsed>
        <div>Content</div>
      </SettingsSection>
    );

    const svgElements = document.querySelectorAll('svg');
    expect(svgElements.length).toBeGreaterThan(0);
  });
});