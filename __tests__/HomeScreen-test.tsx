import { render } from '@testing-library/react-native';

import { Redirect } from 'expo-router';

jest.mock('expo-router', () => ({
	__esModule: true,
	Redirect: jest.fn(() => null),
}));

describe('<HomeScreen />', () => {
	test('Redirects to discover', () => {
		render(<Redirect href="/library" />);

		expect(Redirect).toHaveBeenCalledWith(expect.objectContaining({ href: '/library' }), undefined);
	});
});
