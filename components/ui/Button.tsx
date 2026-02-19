import type { PressableProps, TextProps } from 'react-native';
import { Pressable, Text } from 'react-native';

type ButtonVariant = 'primary' | 'secondary';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends PressableProps {
	variant?: ButtonVariant;
	size?: ButtonSize;
	className?: string;
	textClassName?: string;
	label: string;
}

const baseStyles = 'rounded-btn items-center justify-center';

const sizeStyles: Record<ButtonSize, { container: string; text: string }> = {
	sm: {
		container: 'px-4 py-2',
		text: 'text-preset-1',
	},
	md: {
		container: 'px-5 py-3',
		text: 'text-preset-2',
	},
	lg: {
		container: 'px-6 py-3.5',
		text: 'text-preset-2',
	},
};

const variantStyles: Record<ButtonVariant, { container: string; text: string }> = {
	primary: {
		container: 'bg-primary',
		text: 'text-primary-foreground',
	},
	secondary: {
		container: 'border border-border bg-transparent',
		text: 'text-foreground',
	},
};

export function Button({ label, variant = 'primary', size = 'md', className, textClassName, ...props }: ButtonProps) {
	const sizeStyle = sizeStyles[size];
	const variantStyle = variantStyles[variant];
	return (
		<Pressable className={`${baseStyles} ${sizeStyle.container} ${variantStyle.container} ${className ?? ''}`} {...props}>
			<Text className={`${sizeStyle.text} font-heading font-semibold ${variantStyle.text} ${textClassName ?? ''}`}>{label}</Text>
		</Pressable>
	);
}

export function ButtonText({ className, ...props }: TextProps & { className?: string }) {
	return <Text className={`font-heading font-semibold ${className ?? ''}`} {...props} />;
}
