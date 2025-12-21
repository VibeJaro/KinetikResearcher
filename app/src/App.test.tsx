import { render, screen } from '@testing-library/react';
import { App } from './App';

it('renders header title', () => {
  render(<App />);
  expect(screen.getByText('Kinetik Researcher')).toBeInTheDocument();
});
