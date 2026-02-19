import type { PressableProps, TextProps } from 'react-native';
import { Pressable, Text } from 'react-native';

import { Link, type Href } from 'expo-router';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonBaseProps {
	variant?: ButtonVariant;
	size?: ButtonSize;
	outline?: boolean;
	className?: string;
	textClassName?: string;
	label: string;
}

type ButtonAsButton = ButtonBaseProps & { href?: undefined } & PressableProps;
type ButtonAsLink = ButtonBaseProps & { href: Href; onPress?: undefined };
type ButtonProps = ButtonAsButton | ButtonAsLink;

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

const variantStyles: Record<ButtonVariant, { container: string; text: string; outlineContainer: string; outlineText: string }> = {
	primary: {
		container: 'bg-primary',
		text: 'text-primary-foreground',
		outlineContainer: 'border-2 border-primary bg-transparent',
		outlineText: 'text-primary',
	},
	secondary: {
		container: 'border border-border bg-transparent',
		text: 'text-foreground',
		outlineContainer: 'border-2 border-border bg-transparent',
		outlineText: 'text-foreground',
	},
	ghost: {
		container: 'bg-transparent',
		text: 'text-foreground',
		outlineContainer: 'bg-transparent',
		outlineText: 'text-foreground',
	},
};

function useButtonStyles(variant: ButtonVariant, size: ButtonSize, outline: boolean, className?: string, textClassName?: string) {
	const sizeStyle = sizeStyles[size];
	const variantStyle = variantStyles[variant];
	const containerStyles = outline ? variantStyle.outlineContainer : variantStyle.container;
	const textStyles = outline ? variantStyle.outlineText : variantStyle.text;
	return {
		containerClassName: `${baseStyles} ${sizeStyle.container} ${containerStyles} ${className ?? ''}`,
		textClassName: `${sizeStyle.text} font-body font-semibold ${textStyles} ${textClassName ?? ''}`,
	};
}

export function Button({ label, variant = 'primary', size = 'md', outline = false, className, textClassName, href, ...props }: ButtonProps) {
	const styles = useButtonStyles(variant, size, outline, className, textClassName);

	if (href) {
		return (
			<Link href={href} className={styles.containerClassName}>
				<Text className={styles.textClassName}>{label}</Text>
			</Link>
		);
	}

	return (
		<Pressable className={styles.containerClassName} {...(props as PressableProps)}>
			<Text className={styles.textClassName}>{label}</Text>
		</Pressable>
	);
}

export function ButtonText({ className, ...props }: TextProps & { className?: string }) {
	return <Text className={`font-body font-semibold ${className ?? ''}`} {...props} />;
}
