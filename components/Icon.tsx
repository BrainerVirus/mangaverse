import type { ComponentProps } from "react"

import type { LucideIcon } from "lucide-react-native"

type IconProps = ComponentProps<LucideIcon>

interface AppIconProps extends IconProps {
	icon: LucideIcon
}

export function Icon({ icon: IconComponent, ...props }: AppIconProps) {
	return <IconComponent {...props} />
}
