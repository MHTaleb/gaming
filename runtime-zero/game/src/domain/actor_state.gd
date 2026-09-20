class_name RZActorState
extends RefCounted
## One combatant's mutable state. Value-oriented RefCounted data, never a Node.

var id: String = ""
var display_name: String = ""
var kind: String = "enemy"
var max_hp: int = 1
var hp: int = 1
var attack: int = 0
var defense: int = 0
var energy: int = 0
var energy_cap: int = 0
## Hero only, single-use (rules v2 / RV-001): halves the next incoming hit and is
## consumed by it; an unused guard expires when the hero's next turn begins.
var guard_active: bool = false
## Boss only: heavy attack is telegraphed for the next boss turn.
var telegraph_pending: bool = false
## Boss only: normal attacks since the last heavy telegraph.
var normal_attacks_since_heavy: int = 0

static func make(p_id: String, p_display_name: String, p_kind: String, p_max_hp: int,
		p_attack: int, p_defense: int, p_energy_cap: int = 0, p_energy: int = 0) -> RZActorState:
	var actor := RZActorState.new()
	actor.id = p_id
	actor.display_name = p_display_name
	actor.kind = p_kind
	actor.max_hp = p_max_hp
	actor.hp = p_max_hp
	actor.attack = p_attack
	actor.defense = p_defense
	actor.energy_cap = p_energy_cap
	actor.energy = p_energy
	return actor

func alive() -> bool:
	return hp > 0

func clamp_resources() -> void:
	hp = clampi(hp, 0, max_hp)
	energy = clampi(energy, 0, energy_cap)

func duplicate_state() -> RZActorState:
	var copy := RZActorState.new()
	copy.id = id
	copy.display_name = display_name
	copy.kind = kind
	copy.max_hp = max_hp
	copy.hp = hp
	copy.attack = attack
	copy.defense = defense
	copy.energy = energy
	copy.energy_cap = energy_cap
	copy.guard_active = guard_active
	copy.telegraph_pending = telegraph_pending
	copy.normal_attacks_since_heavy = normal_attacks_since_heavy
	return copy

func to_dict() -> Dictionary:
	return {
		"id": id,
		"display_name": display_name,
		"kind": kind,
		"max_hp": max_hp,
		"hp": hp,
		"attack": attack,
		"defense": defense,
		"energy": energy,
		"energy_cap": energy_cap,
		"guard_active": guard_active,
		"telegraph_pending": telegraph_pending,
		"normal_attacks_since_heavy": normal_attacks_since_heavy,
	}
