"""Operaciones escalares para una boca cuyo eje facial no coincide con X=0."""


def centro_y_semiancho(x_l, x_r):
    cx = (x_l + x_r) / 2.0
    return cx, (x_l - x_r) / 2.0


def radial(x, cx):
    return x - cx


def reflejar(x, cx):
    return 2.0 * cx - x
