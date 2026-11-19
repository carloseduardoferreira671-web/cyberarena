extends CharacterBody3D

var max_health = 7500
var health = 7500

var speed = 8.0
var super_active = false
var super_duration = 6.0

var base_damage = 500
var attack_cooldown = 0.6
var can_attack = true

var ammo = 3
var max_ammo = 3
var ammo_reload_time = 4.0

var super_charge = 0
var super_needed = 8

@onready var anim = $Anim
@onready var state = $State
@onready var health_label = $HealthBar
@onready var model = $Model

func _process(delta):
    health_label.text = str(health)

func _physics_process(delta):
    var moving = false

    var input_vector = Vector3.ZERO
    input_vector.x = Input.get_action_strength("move_right") - Input.get_action_strength("move_left")
    input_vector.z = Input.get_action_strength("move_backward") - Input.get_action_strength("move_forward")

    if input_vector.length() > 0:
        moving = true

    # mover personagem
    velocity.x = input_vector.x * speed
    velocity.z = input_vector.z * speed
    move_and_slide()

    # trocar animação
    if super_active:
        state.travel("super")
    elif moving:
        state.travel("move")
    else:
        state.travel("idle")

func attack():
    if not can_attack or super_active:
        return
    if ammo <= 0:
        return

    can_attack = false
    ammo -= 1
    super_charge += 1

    state.travel("attack")

    # hit real
    do_damage(base_damage)

    await get_tree().create_timer(attack_cooldown).timeout
    can_attack = true

    if ammo < max_ammo:
        reload_ammo()

func reload_ammo():
    await get_tree().create_timer(ammo_reload_time).timeout
    ammo = min(ammo + 1, max_ammo)

func activate_super():
    if super_charge < super_needed:
        return

    super_charge = 0
    super_active = true
    base_damage = 300
    speed = 9.5

    state.travel("super")
    area_damage()

    await get_tree().create_timer(super_duration).timeout

    super_active = false
    base_damage = 500
    speed = 8

func area_damage():
    # dano pesado ao bater no chão
    print("🔥 SUPER — dano 400% em área + paralisia por 0.75s")

func do_damage(amount):
    print("Dando dano:", amount)

func take_hit(amount):
    health -= amount
    state.travel("hit")

    if health <= 0:
        state.travel("death")

