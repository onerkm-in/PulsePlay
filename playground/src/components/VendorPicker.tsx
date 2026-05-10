import type { VendorInfo } from "../biPanel/registry";

interface VendorPickerProps {
    vendors: VendorInfo[];
    activeVendor: string;
    onChange: (vendor: string) => void;
}

export function VendorPicker(props: VendorPickerProps) {
    return (
        <section className="pp-vendor-picker">
            <label htmlFor="pp-vendor" className="pp-vendor-picker__label">BI tool</label>
            <select
                id="pp-vendor"
                className="pp-vendor-picker__select"
                value={props.activeVendor}
                onChange={(e) => props.onChange(e.target.value)}
            >
                {props.vendors.map(v => (
                    <option key={v.vendor} value={v.vendor}>
                        {v.displayName}{v.configured ? "" : " (needs config)"}
                    </option>
                ))}
            </select>
            <p className="pp-vendor-picker__desc">
                {props.vendors.find(v => v.vendor === props.activeVendor)?.description}
            </p>
        </section>
    );
}
