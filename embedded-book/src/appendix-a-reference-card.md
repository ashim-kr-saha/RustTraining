# Summary and Reference Card

> This appendix serves as a quick-reference cheat sheet for daily embedded Rust development. Keep it bookmarked.

---

## Bitwise Operations Cheat Sheet

Bitwise operations are the lingua franca of register manipulation. Every embedded developer must have these at their fingertips.

| Operation | Rust Syntax | Example | Result | Use Case |
|---|---|---|---|---|
| Set bit N | `val \| (1 << N)` | `0b0000 \| (1 << 2)` | `0b0100` | Enable a peripheral bit |
| Clear bit N | `val & !(1 << N)` | `0b1111 & !(1 << 2)` | `0b1011` | Disable a peripheral bit |
| Toggle bit N | `val ^ (1 << N)` | `0b0100 ^ (1 << 2)` | `0b0000` | Flip a GPIO output |
| Test bit N | `(val >> N) & 1` | `(0b0100 >> 2) & 1` | `1` | Check if a flag is set |
| Set field | `(val & !mask) \| (new << shift)` | See below | — | Write a multi-bit register field |
| Read field | `(val & mask) >> shift` | See below | — | Read a multi-bit register field |
| Create N-bit mask | `(1 << N) - 1` | `(1 << 4) - 1` | `0b1111` | Mask for 4-bit field |
| Mask at offset | `((1 << width) - 1) << offset` | `0xF << 4` | `0xF0` | Field mask at bit 4 |

### Multi-Bit Field Example

```rust
// Register layout: [31:8] reserved | [7:4] prescaler (4 bits) | [3:0] mode (4 bits)
const PRESCALER_SHIFT: u32 = 4;
const PRESCALER_MASK: u32 = 0xF << PRESCALER_SHIFT; // 0xF0

// Read prescaler field
let prescaler = (reg_value & PRESCALER_MASK) >> PRESCALER_SHIFT;

// Write prescaler = 7 without affecting other fields
let new_val = (reg_value & !PRESCALER_MASK) | (7 << PRESCALER_SHIFT);
```

---

## Hex / Binary / Decimal Conversion

| Hex | Binary | Decimal | Common Meaning |
|---|---|---|---|
| `0x01` | `0b0000_0001` | 1 | Bit 0 |
| `0x02` | `0b0000_0010` | 2 | Bit 1 |
| `0x04` | `0b0000_0100` | 4 | Bit 2 |
| `0x08` | `0b0000_1000` | 8 | Bit 3 |
| `0x10` | `0b0001_0000` | 16 | Bit 4 |
| `0x20` | `0b0010_0000` | 32 | Bit 5 |
| `0x40` | `0b0100_0000` | 64 | Bit 6 |
| `0x80` | `0b1000_0000` | 128 | Bit 7 |
| `0xFF` | `0b1111_1111` | 255 | All bits set (8-bit) |
| `0xFFFF_FFFF` | All 1s | 4,294,967,295 | All bits set (32-bit) |

---

## `embedded-hal` Trait Quick Reference

### GPIO

```rust
use embedded_hal::digital::{InputPin, OutputPin, StatefulOutputPin};

// OutputPin
pin.set_high()?;
pin.set_low()?;

// InputPin
let pressed: bool = pin.is_low()?;

// StatefulOutputPin
pin.toggle()?;
let is_on: bool = pin.is_set_low()?;
```

### I2C

```rust
use embedded_hal::i2c::I2c;

// Write bytes to device
i2c.write(0x76, &[register_addr, value])?;

// Read bytes from device
let mut buf = [0u8; 4];
i2c.read(0x76, &mut buf)?;

// Write then read (common: write register address, read data)
i2c.write_read(0x76, &[register_addr], &mut buf)?;
```

### SPI

```rust
use embedded_hal::spi::SpiBus;

// Full-duplex transfer
let mut read_buf = [0u8; 4];
let write_buf = [0x80 | REG_ADDR, 0, 0, 0];
spi.transfer(&mut read_buf, &write_buf)?;

// Write only
spi.write(&[0x00, 0x01, 0x02])?;

// Read only (writes zeros)
let mut buf = [0u8; 8];
spi.read(&mut buf)?;
```

### Delay

```rust
use embedded_hal::delay::DelayNs;

delay.delay_ns(1_000);       // 1 microsecond
delay.delay_us(100);          // 100 microseconds
delay.delay_ms(500);          // 500 milliseconds
```

### Async Variants (`embedded-hal-async`)

```rust
use embedded_hal_async::i2c::I2c;
use embedded_hal_async::spi::SpiBus;

// Same API, but returns futures
i2c.write_read(0x76, &[reg], &mut buf).await?;
spi.transfer(&mut read, &write).await?;
```

---

## RTIC v2 Macro Syntax

```rust
#[app(device = pac_crate, peripherals = true, dispatchers = [FREE_IRQ])]
mod app {
    #[shared]
    struct Shared { /* resources locked via .lock() */ }

    #[local]
    struct Local { /* resources owned by one task */ }

    #[init]
    fn init(cx: init::Context) -> (Shared, Local) { /* ... */ }

    #[idle]
    fn idle(cx: idle::Context) -> ! { loop { asm::wfi(); } }

    // Hardware task — bound to an interrupt
    #[task(binds = IRQ_NAME, shared = [res1], local = [res2], priority = N)]
    fn hw_task(cx: hw_task::Context) { /* ... */ }

    // Software task — async, spawned via task_name::spawn()
    #[task(shared = [res1], priority = N)]
    async fn sw_task(cx: sw_task::Context) { /* ... */ }
}
```

### RTIC Resource Access

```rust
// Shared resource — requires lock()
cx.shared.counter.lock(|counter| {
    *counter += 1;
});

// Local resource — direct access (no locking)
cx.local.led.toggle();

// Multi-resource lock (prevents deadlock via consistent ordering)
(cx.shared.res1, cx.shared.res2).lock(|r1, r2| {
    // Both locked atomically
});
```

---

## Embassy Quick Reference

### Task Declaration

```rust
#[embassy_executor::main]
async fn main(spawner: Spawner) {
    let p = embassy_nrf::init(Default::default());
    spawner.spawn(my_task(p.P0_13.into())).unwrap();
}

#[embassy_executor::task]
async fn my_task(pin: AnyPin) {
    // Task body — must be async
}
```

### Timer / Delay

```rust
use embassy_time::{Timer, Duration, Instant, Ticker};

Timer::after_millis(500).await;
Timer::after_secs(1).await;
Timer::after(Duration::from_hz(10)).await; // 100ms

let mut ticker = Ticker::every(Duration::from_millis(100));
loop {
    do_work().await;
    ticker.next().await; // Compensates for execution time
}

// Timeout
use embassy_time::with_timeout;
match with_timeout(Duration::from_secs(5), i2c.read(addr, &mut buf)).await {
    Ok(Ok(())) => { /* success */ }
    Ok(Err(e)) => { /* I2C error */ }
    Err(_) => { /* timeout */ }
}
```

### Sync Primitives

```rust
use embassy_sync::channel::Channel;
use embassy_sync::signal::Signal;
use embassy_sync::mutex::Mutex;
use embassy_sync::blocking_mutex::raw::CriticalSectionRawMutex;

// Channel (bounded, MPSC)
static CH: Channel<CriticalSectionRawMutex, u32, 4> = Channel::new();
CH.send(42).await;           // Blocks if full
let val = CH.receive().await; // Blocks if empty

// Signal (last-writer-wins)
static SIG: Signal<CriticalSectionRawMutex, bool> = Signal::new();
SIG.signal(true);             // Non-blocking
let val = SIG.wait().await;   // Blocks until signaled

// Mutex (async-aware)
static MTX: Mutex<CriticalSectionRawMutex, u32> = Mutex::new(0);
let mut guard = MTX.lock().await;
*guard += 1;
```

---

## Debugging Tools

### `probe-rs`

```bash
# Install
cargo install probe-rs-tools

# Flash and run (with RTT log output)
cargo run --release

# Flash only
probe-rs download --chip nRF52840_xxAA target/thumbv7em-none-eabihf/release/firmware

# Start GDB server
probe-rs gdb --chip nRF52840_xxAA

# List connected probes
probe-rs list

# Reset the chip
probe-rs reset --chip nRF52840_xxAA
```

### `defmt` Logging

```rust
// In code:
defmt::trace!("Verbose: {}", val);      // TRACE — disabled by default
defmt::debug!("Debug: {}", val);        // DEBUG
defmt::info!("Info: {}", val);          // INFO — default level
defmt::warn!("Warning: {}", val);       // WARN
defmt::error!("Error: {}", val);        // ERROR

// Custom types:
#[derive(defmt::Format)]
struct Packet { id: u8, len: u16 }
defmt::info!("Packet: {:?}", packet);

// In .cargo/config.toml:
[env]
DEFMT_LOG = "info"     # or "trace", "debug", "warn", "error"
```

### GDB Commands for Embedded

```bash
# Connect to probe-rs GDB server
arm-none-eabi-gdb target/thumbv7em-none-eabihf/release/firmware

(gdb) target remote :1337       # Connect to probe-rs
(gdb) monitor reset halt        # Reset and halt
(gdb) break main                # Set breakpoint
(gdb) continue                  # Run
(gdb) print COUNTER             # Read a static variable
(gdb) x/4xw 0x50000504         # Read 4 words at GPIO OUT register
(gdb) info registers            # Show CPU registers
(gdb) bt                        # Backtrace
(gdb) monitor reset             # Reset without halting
```

---

## Common `Cargo.toml` Dependencies

```toml
# ── Core Runtime ──
cortex-m = { version = "0.7", features = ["critical-section-single-core"] }
cortex-m-rt = "0.7"

# ── Panic Handlers (choose one) ──
panic-halt = "1.0"                # Production: infinite loop
panic-probe = { version = "0.3", features = ["print-defmt"] }  # Dev: breakpoint + defmt

# ── Logging ──
defmt = "0.3"
defmt-rtt = "0.4"                # Transport: Real-Time Transfer

# ── Embassy ──
embassy-executor = { version = "0.6", features = ["arch-cortex-m", "executor-thread"] }
embassy-time = { version = "0.4", features = ["tick-hz-32_768"] }
embassy-sync = "0.6"
embassy-nrf = { version = "0.2", features = ["nrf52840", "time-driver-rtc1", "gpiote"] }

# ── RTIC ──
rtic = { version = "2.1", features = ["thumbv7-backend"] }
rtic-monotonics = "2.0"

# ── HAL / PAC (non-Embassy) ──
nrf52840-hal = { version = "0.18", features = ["rt"] }
nrf52840-pac = "0.12"

# ── Portable Traits ──
embedded-hal = "1.0"
embedded-hal-async = "1.0"

# ── Utilities ──
heapless = "0.8"
static_cell = "2"
```

---

## `.cargo/config.toml` Template

```toml
[build]
target = "thumbv7em-none-eabihf"  # Change for your chip

[target.thumbv7em-none-eabihf]
runner = "probe-rs run --chip nRF52840_xxAA"  # Change for your chip
rustflags = [
    "-C", "link-arg=-Tlink.x",     # cortex-m-rt linker script
    "-C", "link-arg=-Tdefmt.x",    # defmt linker script (if using defmt)
]

[env]
DEFMT_LOG = "info"
```

---

## Target / Chip Quick Reference

| Target Triple | Architecture | Chips |
|---|---|---|
| `thumbv6m-none-eabi` | Cortex-M0/M0+ | RP2040, nRF51, STM32F0 |
| `thumbv7m-none-eabi` | Cortex-M3 | STM32F1, LPC1768 |
| `thumbv7em-none-eabi` | Cortex-M4/M7 (no FPU) | — |
| `thumbv7em-none-eabihf` | Cortex-M4F/M7F (FPU) | nRF52840, STM32F4, STM32H7 |
| `thumbv8m.main-none-eabihf` | Cortex-M33 (TrustZone) | nRF9160, STM32L5 |
| `riscv32imac-unknown-none-elf` | RISC-V 32 | ESP32-C3 |

---

## Ecosystem Links

| Resource | URL |
|---|---|
| The Embedded Rust Book | <https://docs.rust-embedded.org/book/> |
| `embedded-hal` docs | <https://docs.rs/embedded-hal/latest/> |
| Embassy project | <https://embassy.dev/> |
| RTIC project | <https://rtic.rs/> |
| `probe-rs` | <https://probe.rs/> |
| `defmt` | <https://defmt.ferrous-systems.com/> |
| Awesome Embedded Rust | <https://github.com/rust-embedded/awesome-embedded-rust> |
| `svd2rust` | <https://docs.rs/svd2rust/latest/> |
| ARM Cortex-M reference | <https://developer.arm.com/ip-products/processors/cortex-m> |
